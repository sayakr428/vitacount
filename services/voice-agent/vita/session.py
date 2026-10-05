"""Verifies the short-lived session token minted by the web app.

Token format (see apps/web/lib/agent-session.ts): ``<payload>.<signature>``,
both base64url without padding. ``payload`` is JSON with ``sub`` (user id),
``tid`` (tenant id), ``role``, ``iat`` and ``exp`` (unix seconds);
``signature`` is HMAC-SHA256 over the payload segment with
``AGENT_SHARED_SECRET``. The bot never sees the user's password or the
Supabase service key — this token only proves who opened the session.
"""

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

# Small allowance for clock drift between the web host and the bot host.
CLOCK_SKEW_SECS = 30


@dataclass(frozen=True)
class AgentSession:
    user_id: str
    tenant_id: str
    role: str
    expires_at: int


class InvalidSessionToken(Exception):
    pass


def _b64url_decode(segment: str) -> bytes:
    return base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4))


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def sign_session_token(payload: dict, secret: str) -> str:
    """Mirror of the web app's signer; used by tests and local tooling."""
    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64url_encode(sig)}"


def verify_session_token(token: object, secret: str, now: float | None = None) -> AgentSession:
    if not secret:
        raise InvalidSessionToken("AGENT_SHARED_SECRET is not configured")
    if not isinstance(token, str) or token.count(".") != 1:
        raise InvalidSessionToken("malformed token")

    body, sig = token.split(".")
    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    try:
        provided = _b64url_decode(sig)
    except ValueError as e:
        raise InvalidSessionToken("malformed signature") from e
    if not hmac.compare_digest(expected, provided):
        raise InvalidSessionToken("bad signature")

    try:
        payload = json.loads(_b64url_decode(body))
    except ValueError as e:
        raise InvalidSessionToken("malformed payload") from e

    now = time.time() if now is None else now
    exp = payload.get("exp")
    if not isinstance(exp, int | float) or exp + CLOCK_SKEW_SECS < now:
        raise InvalidSessionToken("expired")

    try:
        return AgentSession(
            user_id=str(payload["sub"]),
            tenant_id=str(payload["tid"]),
            role=str(payload["role"]),
            expires_at=int(exp),
        )
    except KeyError as e:
        raise InvalidSessionToken(f"missing claim {e}") from e
