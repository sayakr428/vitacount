# Pipecat Cloud image (also runs anywhere Docker does).
# Based on the official template from `pipecat init --deploy-to-cloud`.
FROM dailyco/pipecat-base:latest

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

# Dependencies first (cached layer), from the committed lockfile.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

# Application code. The base image runs bot.py's `bot(runner_args)`.
COPY ./bot.py bot.py
COPY ./vita vita
