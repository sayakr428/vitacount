"""Pipecat UIWorker that matches labels instantly and reports what really happened.

Two changes from the stock worker:

- Literal labels ("the Email field") resolve without an LLM call
  (see ui_match.py); vague descriptions still use the classifier.
- The stock ``screen`` tool reports ``done`` as soon as the command is
  *sent*, so the model can't tell a typed value from a rejected one, or a
  saved form from one blocked by validation — and then claims success.
  Here each command waits for the dock's ``command_result`` event (the
  value now in the field; after a click, the URL, any alerts and any
  invalid fields) and returns that as the tool result.
"""

import asyncio
from typing import Any

from loguru import logger
from pipecat.workers.ui import UIWorker, ui_event

from vita.ui_match import Candidate, is_forbidden_target, match_element

# Fills/scrolls report back almost immediately (after the cursor glide).
RESULT_TIMEOUT_SECS = 6.0
# A click on a ledger-changing button waits for the user's Allow/Cancel.
CLICK_RESULT_TIMEOUT_SECS = 90.0
_ACTIONS = {"click", "scroll_to", "highlight", "select_text", "fill"}


class VitaUIWorker(UIWorker):
    def __init__(self, name: str, **kwargs: Any):
        # UI events are acknowledgements, not conversation; keep them out of
        # the classifier's context.
        kwargs.setdefault("inject_events", False)
        super().__init__(name, **kwargs)
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}

    # --- label matching ---------------------------------------------------

    def _candidates(self) -> list[Candidate]:
        return [
            Candidate(ref=e.ref, role=e.role, name=e.name, offscreen="offscreen" in e.state)
            for e in self._named_elements()
        ]

    def _instant(self, description: str, action: str | None) -> str | None:
        ref = match_element(description, self._candidates(), action)
        if ref:
            logger.debug(f"{self.name}: '{description}' -> {ref} (label match)")
        return ref

    async def _resolve(self, description: str, action: str | None) -> str | None:
        return self._instant(description, action) or await self.which_element(description)

    async def _find(self, description: str) -> dict[str, Any]:
        ref = self._instant(description, None)
        if ref is None:
            return await super()._find(description)
        label = next((e.name for e in self._named_elements() if e.ref == ref), None)
        return {"ref": ref, "label": label, "confidence": 1.0}

    # --- acting with acknowledgement -------------------------------------

    @ui_event("command_result")
    async def on_command_result(self, message) -> None:
        payload = message.payload if isinstance(message.payload, dict) else {}
        future = self._pending.pop(str(payload.get("ref", "")), None)
        if future and not future.done():
            future.set_result(payload)

    async def _send_and_wait(self, command: str, ref: str, value: str | None) -> dict[str, Any]:
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[ref] = future
        if command == "set_input_value":
            await self.set_input_value(ref, value or "")
        else:
            await getattr(self, command)(ref)
        timeout = CLICK_RESULT_TIMEOUT_SECS if command == "click" else RESULT_TIMEOUT_SECS
        try:
            return await asyncio.wait_for(future, timeout)
        except TimeoutError:
            return {"ok": False, "error": "The page did not confirm the action."}
        finally:
            self._pending.pop(ref, None)

    async def act(self, action: str, description: str, *, value: str | None = None) -> str | None:
        ref = await self._resolve(description, action)
        if ref:
            await self._send_and_wait(action, ref, value)
        return ref

    async def fill_many(self, fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Fill several fields in order; one result per field (the fill_form tool)."""
        results = []
        for entry in fields[:25]:
            label = str(entry.get("field", "")).strip()
            value = entry.get("value")
            if not label or value is None:
                results.append({"field": label, "done": False, "error": "Missing field or value."})
                continue
            results.append({"field": label, **await self._screen("fill", label, str(value))})
        return results

    async def _screen(self, action: str, target: str, value: str | None) -> dict[str, Any]:
        if action not in _ACTIONS:
            return await super()._screen(action, target, value)
        command = "set_input_value" if action == "fill" else action
        if command == "click" and is_forbidden_target(target):
            return {
                "done": False,
                "reason": "Not allowed: Vita never deletes anything or changes agents, team "
                "members or workspaces. Tell the user they must do it themselves.",
            }
        ref = await self._resolve(target, command)
        if ref is None:
            return {
                "done": False,
                "error": "No element on screen matches that. List the fields and use the exact "
                "label.",
            }
        label = next((e.name for e in self._named_elements() if e.ref == ref), None)
        result = await self._send_and_wait(command, ref, value)
        answer: dict[str, Any] = {"done": bool(result.get("ok")), "label": label}
        for key in ("value", "url", "alerts", "invalid", "reason", "error"):
            if result.get(key):
                answer[key] = result[key]
        return answer
