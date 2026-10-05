import time

import pytest

from vita.app_map import ALLOWED_PATHS, title_for
from vita.session import InvalidSessionToken, sign_session_token, verify_session_token

SECRET = "test-secret"


def payload(**overrides):
    now = int(time.time())
    return {"sub": "u1", "tid": "t1", "role": "owner", "iat": now, "exp": now + 600, **overrides}


def test_valid_token_round_trips():
    s = verify_session_token(sign_session_token(payload(), SECRET), SECRET)
    assert (s.user_id, s.tenant_id, s.role) == ("u1", "t1", "owner")


@pytest.mark.parametrize("token", [None, "", "abc", "a.b.c", 123])
def test_malformed_tokens_rejected(token):
    with pytest.raises(InvalidSessionToken):
        verify_session_token(token, SECRET)


def test_wrong_secret_rejected():
    with pytest.raises(InvalidSessionToken, match="bad signature"):
        verify_session_token(sign_session_token(payload(), "other"), SECRET)


def test_tampered_payload_rejected():
    sig = sign_session_token(payload(), SECRET).split(".")[1]
    forged = sign_session_token(payload(role="admin"), SECRET).split(".")[0]
    with pytest.raises(InvalidSessionToken):
        verify_session_token(f"{forged}.{sig}", SECRET)


def test_expired_rejected():
    expired = payload(exp=int(time.time()) - 120)
    with pytest.raises(InvalidSessionToken, match="expired"):
        verify_session_token(sign_session_token(expired, SECRET), SECRET)


def test_missing_secret_rejected():
    with pytest.raises(InvalidSessionToken):
        verify_session_token(sign_session_token(payload(), SECRET), "")


def test_app_map_titles():
    assert "/sales/new?type=invoice" in ALLOWED_PATHS
    assert title_for("/reports") == "Reports"
    assert title_for("/sales/3f2a9c") == "A sales document"
    assert title_for("/nowhere") is None


def test_system_prompt_builds_for_every_role_and_mode():
    from vita.prompts import build_system_prompt

    for role in ("owner", "admin", "accountant", "staff", "viewer"):
        for mode in ("voice", "chat"):
            prompt = build_system_prompt(role, mode)
            assert "fill_form" in prompt and "/contacts" in prompt
