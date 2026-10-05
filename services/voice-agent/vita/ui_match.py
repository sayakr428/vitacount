"""Instant element matching for the common case: the target is a visible label.

Pipecat's UIWorker sends every lookup to an LLM classifier along with the
whole page snapshot (~4s per field on NVIDIA's shared endpoint). Most of
Vita's targets are literal labels ("the Email field", "Line 1 unit price",
"the Add contact button"), which can be resolved exactly. Anything vague or
ambiguous returns None and falls back to the classifier.
"""

import re
from dataclasses import dataclass

INPUT_ROLES = frozenset(
    {"textbox", "spinbutton", "combobox", "searchbox", "checkbox", "radio", "slider"}
)
CLICK_ROLES = frozenset(
    {"button", "link", "checkbox", "radio", "tab", "menuitem", "option", "switch"}
)

# Trailing words that describe the kind of element, mapped to the roles they imply.
ROLE_HINTS: dict[str, frozenset[str]] = {
    "field": INPUT_ROLES,
    "input": INPUT_ROLES,
    "box": INPUT_ROLES,
    "textbox": INPUT_ROLES,
    "dropdown": frozenset({"combobox"}),
    "select": frozenset({"combobox"}),
    "menu": frozenset({"combobox", "menu", "button"}),
    "picker": frozenset({"combobox"}),
    "checkbox": frozenset({"checkbox"}),
    "button": frozenset({"button", "link"}),
    "link": frozenset({"link", "button"}),
    "tab": frozenset({"tab", "button"}),
}


@dataclass(frozen=True)
class Candidate:
    ref: str
    role: str
    name: str
    offscreen: bool = False


def _normalize(text: str) -> str:
    text = text.strip().strip("\"'“”‘’").lower()
    text = re.sub(r"[\s ]+", " ", text)
    return text


def parse_description(description: str) -> tuple[str, frozenset[str] | None]:
    """'the Add contact button' -> ('add contact', {'button', 'link'})."""
    text = _normalize(description)
    text = re.sub(r"^(the|a|an|on|in|into)\s+", "", text)
    hint: frozenset[str] | None = None
    words = text.split(" ")
    while len(words) > 1 and words[-1] in ROLE_HINTS:
        hint = ROLE_HINTS[words[-1]] if hint is None else hint
        words.pop()
    name = " ".join(words).strip("\"'“”‘’ ")
    return name, hint


def match_element(
    description: str, candidates: list[Candidate], action: str | None = None
) -> str | None:
    """The ref whose label the description names, or None when unsure."""
    want, hint = parse_description(description)
    if not want:
        return None

    roles = hint
    if roles is None and action == "set_input_value":
        roles = INPUT_ROLES
    elif roles is None and action == "click":
        roles = CLICK_ROLES

    def pick(pool: list[Candidate]) -> str | None:
        if not pool:
            return None
        if roles is not None:
            typed = [c for c in pool if c.role in roles]
            if typed:
                pool = typed
            elif hint is not None:
                return None  # user said "button" but no button has that label
        visible = [c for c in pool if not c.offscreen] or pool
        # Several identical labels of the same kind: too ambiguous to guess.
        return visible[0].ref if len(visible) == 1 else None

    exact = [c for c in candidates if _normalize(c.name) == want]
    if exact:
        return pick(exact)
    prefix = [c for c in candidates if _normalize(c.name).startswith(want)]
    if prefix:
        return pick(prefix)
    if len(want) >= 4:
        contains = [c for c in candidates if want in _normalize(c.name)]
        return pick(contains)
    return None


# Mirrors FORBIDDEN in apps/web/components/agent/ui-actions.ts: actions Vita
# must never take for the user (spec: no deleting, no autonomy/kill-switch
# changes, no team/workspace changes, no sign-out). Checked before any lookup.
FORBIDDEN = re.compile(
    r"\b(delete|remove (member|user)|kill[- ]?switch|L[0-3] (off|draft|review|auto)|"
    r"autonomy|send invite|invite|log ?out|sign ?out|switch workspace)\b",
    re.IGNORECASE,
)


def is_forbidden_target(description: str) -> bool:
    return bool(FORBIDDEN.search(description or ""))
