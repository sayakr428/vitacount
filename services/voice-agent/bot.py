"""Vita voice + chat bot (Phase 1-2): NVIDIA STT -> LLM -> TTS over SmallWebRTC.

Run locally::

    uv run bot.py -t webrtc          # http://localhost:7860, POST /api/offer

The web app's VitaDock connects here with ``requestData`` =
``{token, path, mode}``. ``token`` is the HMAC session token from
``POST /api/agent/session``; without a valid one the session is dropped
before any pipeline starts.
"""

import asyncio
import os
import sys

# Pipecat's runner prints emoji; the default Windows console code page
# (cp1252) can't encode them and the process dies at startup.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
from loguru import logger
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker, ProcessorUnusablePolicy
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.llm_service import FunctionCallParams
from pipecat.services.nvidia.llm import NvidiaLLMService
from pipecat.services.nvidia.stt import NvidiaSTTService
from pipecat.services.nvidia.tts import NvidiaTTSService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.workers.runner import WorkerRunner
from pipecat.workers.ui import screen_tools

from vita.app_map import ALLOWED_PATHS, title_for
from vita.nudge import (
    ANNOUNCE_NUDGE,
    CLAIM_NUDGE,
    MAX_NUDGES_PER_USER_TURN,
    announces_unfinished_action,
    claims_action,
)
from vita.prompts import build_system_prompt
from vita.session import AgentSession, InvalidSessionToken, verify_session_token
from vita.ui_worker import VitaUIWorker

load_dotenv(override=True)

# The runner reads PIPECAT_ALLOWED_ORIGINS for CORS/origin checks on /api/offer.
if os.getenv("ALLOWED_ORIGINS") and not os.getenv("PIPECAT_ALLOWED_ORIGINS"):
    os.environ["PIPECAT_ALLOWED_ORIGINS"] = os.environ["ALLOWED_ORIGINS"]

# With reasoning off, nemotron-3-super starts replying in ~0.5s and still makes
# correct tool calls; with it on, the first words take seconds. (nemotron-3.5
# -lightning reasons through its whole token budget and degrades with it off.)
DEFAULT_LLM_MODEL = "nvidia/nemotron-3-super-120b-a12b"
DEFAULT_TTS_VOICE = "Magpie-Multilingual.EN-US.Aria"
UI_WORKER = "ui"
# How long navigate waits for the new page's snapshot before letting Vita act.
NAV_SETTLE_SECS = 4.0

transport_params = {
    "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
}


def llm_extra_params() -> dict:
    if os.getenv("NVIDIA_LLM_THINKING", "false").lower() == "true":
        return {}
    return {"extra_body": {"chat_template_kwargs": {"enable_thinking": False}}}


async def run_bot(
    transport: BaseTransport,
    runner_args: RunnerArguments,
    session: AgentSession,
    initial_path: str,
    mode: str,
    greet: bool = True,
):
    api_key = os.environ["NVIDIA_API_KEY"]
    page = {"path": initial_path}

    stt = NvidiaSTTService(api_key=api_key)
    tts = NvidiaTTSService(
        api_key=api_key,
        settings=NvidiaTTSService.Settings(
            voice=os.getenv("NVIDIA_TTS_VOICE") or DEFAULT_TTS_VOICE
        ),
    )
    llm = NvidiaLLMService(
        api_key=api_key,
        settings=NvidiaLLMService.Settings(
            model=os.getenv("NVIDIA_LLM_MODEL") or DEFAULT_LLM_MODEL,
            system_instruction=build_system_prompt(session.role, mode),
            extra=llm_extra_params(),
        ),
    )

    # Answers "which element does the user mean?" for the screen tool; its own
    # small LLM, so it never sees the conversation.
    ui_worker = VitaUIWorker(
        UI_WORKER,
        llm=NvidiaLLMService(
            api_key=api_key,
            settings=NvidiaLLMService.Settings(
                model=os.getenv("NVIDIA_FAST_MODEL") or DEFAULT_LLM_MODEL,
                extra=llm_extra_params(),
            ),
        ),
    )

    worker: PipelineWorker | None = None

    async def get_current_page(params: FunctionCallParams):
        path = page["path"]
        await params.result_callback({"path": path, "title": title_for(path) or "Unknown page"})

    async def navigate(params: FunctionCallParams):
        path = str(params.arguments.get("path", ""))
        if path not in ALLOWED_PATHS:
            await params.result_callback(
                {"ok": False, "error": f"{path} is not a VitaCount page. Use one from the list."}
            )
            return
        assert worker is not None
        before = ui_worker.snapshot
        await worker.rtvi.send_server_message({"type": "navigate", "path": path})
        page["path"] = path
        # Don't let Vita fill fields against the previous page: wait for the
        # client to stream a snapshot of the new one (or give up after a bit).
        loop = asyncio.get_running_loop()
        deadline = loop.time() + NAV_SETTLE_SECS
        await asyncio.sleep(0.6)
        while ui_worker.snapshot is before and loop.time() < deadline:
            await asyncio.sleep(0.15)
        await params.result_callback({"ok": True, "now_on": title_for(path)})

    async def fill_form(params: FunctionCallParams):
        fields = params.arguments.get("fields")
        if not isinstance(fields, list) or not fields:
            await params.result_callback({"error": "Pass fields as a list of {field, value}."})
            return
        results = await ui_worker.fill_many([f for f in fields if isinstance(f, dict)])
        await params.result_callback(
            {"all_done": all(r.get("done") for r in results), "results": results}
        )

    tools = ToolsSchema(
        standard_tools=[
            *screen_tools(UI_WORKER),
            FunctionSchema(
                name="fill_form",
                description="Fill several fields on the current page in one go, in order. "
                "Use this instead of separate screen fill calls. Each result says whether it "
                "worked and the value now in the field.",
                properties={
                    "fields": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "field": {
                                    "type": "string",
                                    "description": "The field's visible label, e.g. Email "
                                    "or Line 1 unit price",
                                },
                                "value": {
                                    "type": "string",
                                    "description": "Text to type, or the option to choose "
                                    "in a dropdown",
                                },
                            },
                            "required": ["field", "value"],
                        },
                    }
                },
                required=["fields"],
                handler=fill_form,
            ),
            FunctionSchema(
                name="get_current_page",
                description="Returns the page the user is currently looking at in VitaCount.",
                properties={},
                required=[],
                handler=get_current_page,
            ),
            FunctionSchema(
                name="navigate",
                description="Takes the user to a VitaCount page. Use an exact path from the "
                "page list, including any ?type= part.",
                properties={"path": {"type": "string", "enum": sorted(ALLOWED_PATHS)}},
                required=["path"],
                handler=navigate,
            ),
        ]
    )

    context = LLMContext(tools=tools)
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            aggregators.user(),
            llm,
            tts,
            transport.output(),
            aggregators.assistant(),
        ]
    )

    worker = PipelineWorker(
        pipeline,
        name="main",
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
        processor_unusable_policy=ProcessorUnusablePolicy.END,
    )

    @worker.rtvi.event_handler("on_client_message")
    async def on_client_message(rtvi, message):
        # The dock reports client-side navigation so Vita knows where the user is.
        if message.type == "page" and isinstance(message.data, dict):
            path = message.data.get("path")
            if isinstance(path, str) and path.startswith("/"):
                page["path"] = path
        # Esc in the dock: stop talking now. client-js has no interrupt call.
        elif message.type == "stop":
            await rtvi.interrupt_bot()

    # Safety net for replies like "Let me fill the name field." with no tool
    # call: nudge the model to actually do it (bounded per user message).
    # Each LLM response is its own assistant turn. "Let me fill…" is judged per
    # response; "I filled…" against every tool call since the user last spoke.
    turn = {"tool_in_response": False, "tools_since_user": False, "nudges": 0}

    @llm.event_handler("on_function_calls_started")
    async def on_function_calls_started(service, function_calls):
        turn["tool_in_response"] = True
        turn["tools_since_user"] = True

    @aggregators.assistant().event_handler("on_assistant_turn_started")
    async def on_assistant_turn_started(aggregator, *args):
        turn["tool_in_response"] = False
        # Typed (send-text) and spoken messages both land as a user message
        # right before the reply; that marks a new user turn.
        last = context.messages[-1] if context.messages else {}
        if isinstance(last, dict) and last.get("role") == "user":
            turn["tools_since_user"] = False
            turn["nudges"] = 0

    @aggregators.assistant().event_handler("on_assistant_turn_stopped")
    async def on_assistant_turn_stopped(aggregator, message):
        text = message.content or ""
        if message.interrupted or turn["nudges"] >= MAX_NUDGES_PER_USER_TURN:
            return
        if not turn["tools_since_user"] and claims_action(text):
            nudge = CLAIM_NUDGE
        elif not turn["tool_in_response"] and announces_unfinished_action(text):
            nudge = ANNOUNCE_NUDGE
        else:
            return
        turn["nudges"] += 1
        logger.debug(f"Nudging ({'claim' if nudge is CLAIM_NUDGE else 'announce'}): {text!r}")
        context.add_message({"role": "developer", "content": nudge})
        await worker.queue_frame(LLMRunFrame())

    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(ui_worker, worker)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        logger.info(f"Vita session started (tenant={session.tenant_id}, mode={mode})")
        if not greet:
            # The user typed a question while connecting; it arrives right away
            # and a greeting would only talk over it.
            return
        where = title_for(page["path"]) or "VitaCount"
        context.add_message(
            {
                "role": "developer",
                "content": f"The user just opened Vita while on {where}. Greet them in one "
                "short sentence and ask how you can help.",
            }
        )
        await worker.queue_frame(LLMRunFrame())

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info("Vita session ended")
        await runner.cancel()

    await runner.run()


async def bot(runner_args: RunnerArguments):
    body = runner_args.body if isinstance(runner_args.body, dict) else {}
    try:
        session = verify_session_token(body.get("token"), os.getenv("AGENT_SHARED_SECRET", ""))
    except InvalidSessionToken as e:
        logger.warning(f"Rejected Vita session: {e}")
        connection = getattr(runner_args, "webrtc_connection", None)
        if connection is not None:
            await connection.disconnect()
        return

    path = body.get("path")
    initial_path = path if isinstance(path, str) and path.startswith("/") else "/dashboard"
    mode = "chat" if body.get("mode") == "chat" else "voice"
    greet = body.get("greet") is not False

    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args, session, initial_path, mode, greet)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
