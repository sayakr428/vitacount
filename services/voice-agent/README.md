# Vita voice agent

The Python service behind Vita, VitaCount's voice and chat assistant. It's built on
[Pipecat](https://github.com/pipecat-ai/pipecat) 1.12 and uses NVIDIA models for speech-to-text,
the LLM, and text-to-speech. It lives outside the pnpm workspace, so `pnpm install`, `pnpm build`
and Vercel never touch it.

```
Browser dock ── POST /api/agent/session ──► Next.js (signs a 15-min token)
     │
     └── /start + WebRTC (token in body) ──► bot.py
           NVIDIA STT → nemotron-3-super → NVIDIA TTS, Silero VAD
           tools: get_current_page, navigate
```

## Run locally

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
cp .env.example .env          # fill NVIDIA_API_KEY and AGENT_SHARED_SECRET
uv sync
uv run bot.py -t webrtc       # http://localhost:7860
```

Then set these in `apps/web/.env.local` and restart `pnpm dev`:

```
NEXT_PUBLIC_AGENT_ENABLED=true
NEXT_PUBLIC_AGENT_URL=http://localhost:7860
AGENT_SHARED_SECRET=<same value as in .env>
```

Open any signed-in page. The robot sits in the bottom-right corner.

| Input | What happens |
|---|---|
| Click the robot, or tap `Ctrl+Space` | Opens the dock and connects in chat mode (mic off) |
| Hold `Ctrl+Space` | Push-to-talk: the mic is live while the keys are held |
| `Esc` | Stops Vita talking; a second press closes the dock |
| Close the dock | Disconnects; Vita hears and sees nothing while closed |

On Windows, if `uv` reports that an Application Control policy blocked its managed Python, use the
system interpreter instead:
`UV_PYTHON_PREFERENCE=only-system uv sync --python "C:/Program Files/Python311/python.exe"`.

## Security model

- The bot only accepts a session that carries the HMAC token minted by `POST /api/agent/session`
  for a signed-in user. Forged, expired or missing tokens are dropped before any pipeline starts
  (see `vita/session.py`).
- The bot holds no Supabase credentials. Later phases call the web app's tool gateway with the
  user's own access token, so RLS applies.
- `ALLOWED_ORIGINS` restricts which browser origins can open a session.

## Models

| Env | Default | Notes |
|---|---|---|
| `NVIDIA_LLM_MODEL` | `nvidia/nemotron-3-super-120b-a12b` | About 0.5s to first words with reasoning off; correct tool calls |
| `NVIDIA_LLM_THINKING` | `false` | Turning reasoning on adds seconds of silence before each reply |
| `NVIDIA_TTS_VOICE` | `Magpie-Multilingual.EN-US.Aria` | |

`nemotron-3.5-lightning` was tested and rejected. It spends its whole token budget reasoning, and
with reasoning off it produces garbled text.

## Checks

```bash
uv run ruff check . && uv run ruff format --check .
uv run pytest -q
```

## Roadmap

Phases 3–7 of the Vita spec are still to come: on-screen operation through `UIWorker` with a ghost
cursor, the tool registry and gateway, specialist workers, guided business flows, and deployment.
