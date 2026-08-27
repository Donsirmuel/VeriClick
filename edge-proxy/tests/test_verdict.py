"""The verdict call sits in front of every click, so its failure behaviour
matters more than its success behaviour: a slow or broken backend must let real
people through, never stall or block them."""

import json

import fakeredis.aioredis
import httpx
import pytest

from app import verdict as verdict_mod


BLOCK = {"is_bot": True, "decision": "blocked", "reason": "Suspicious UA", "bot_action": "honeypot"}
ALLOW = {"is_bot": False, "decision": "allowed", "reason": "", "bot_action": "honeypot"}


class _Resp:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


def _client_returning(payload, status_code=200, raises=None):
    class _C:
        calls = 0

        async def post(self, url, json=None, headers=None):
            _C.calls += 1
            if raises:
                raise raises
            return _Resp(payload, status_code)

    return _C()


@pytest.fixture(autouse=True)
def _api_key(monkeypatch):
    monkeypatch.setattr(verdict_mod.settings, "EDGE_API_KEY", "ek_test")


@pytest.fixture
def redis():
    return fakeredis.aioredis.FakeRedis(decode_responses=True)


@pytest.mark.asyncio
async def test_a_bot_verdict_is_returned(monkeypatch, redis):
    monkeypatch.setattr(verdict_mod, "_get_client", lambda: _client_returning(BLOCK))
    out = await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
    assert out["is_bot"] is True
    assert out["reason"] == "Suspicious UA"


@pytest.mark.asyncio
async def test_a_human_verdict_is_returned(monkeypatch, redis):
    monkeypatch.setattr(verdict_mod, "_get_client", lambda: _client_returning(ALLOW))
    out = await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "Mozilla/5.0")
    assert out["is_bot"] is False


@pytest.mark.asyncio
async def test_clearance_cookie_is_forwarded_to_backend(monkeypatch, redis):
    class _Client:
        async def post(self, url, json=None, headers=None):
            assert headers["Cookie"] == "_vc_pow=clearance"
            return _Resp(ALLOW)

    monkeypatch.setattr(verdict_mod, "_get_client", lambda: _Client())
    out = await verdict_mod.get_verdict(
        redis, "r.example.com", "promo", "1.2.3.4", "Mozilla/5.0",
        cookies="_vc_pow=clearance",
    )
    assert out["is_bot"] is False


@pytest.mark.asyncio
async def test_a_timeout_allows_the_visitor(monkeypatch, redis):
    # The whole point: a redirect must not break because a check was slow.
    monkeypatch.setattr(
        verdict_mod, "_get_client",
        lambda: _client_returning(None, raises=httpx.TimeoutException("too slow")),
    )
    out = await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
    assert out["is_bot"] is False
    assert out["reason"] == "verdict-unavailable"


@pytest.mark.asyncio
async def test_a_connection_error_allows_the_visitor(monkeypatch, redis):
    monkeypatch.setattr(
        verdict_mod, "_get_client",
        lambda: _client_returning(None, raises=httpx.ConnectError("no route to host")),
    )
    out = await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
    assert out["is_bot"] is False


@pytest.mark.asyncio
async def test_a_500_allows_the_visitor(monkeypatch, redis):
    monkeypatch.setattr(verdict_mod, "_get_client", lambda: _client_returning({}, status_code=500))
    out = await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
    assert out["is_bot"] is False


@pytest.mark.asyncio
async def test_a_malformed_body_allows_the_visitor(monkeypatch, redis):
    # A backend that answers 200 with nonsense must not be treated as a block.
    monkeypatch.setattr(verdict_mod, "_get_client", lambda: _client_returning({"unexpected": 1}))
    out = await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
    assert out["is_bot"] is False


@pytest.mark.asyncio
async def test_no_api_key_skips_the_call_entirely(monkeypatch, redis):
    monkeypatch.setattr(verdict_mod.settings, "EDGE_API_KEY", "")
    called = _client_returning(BLOCK)
    monkeypatch.setattr(verdict_mod, "_get_client", lambda: called)
    out = await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
    assert out["is_bot"] is False
    assert type(called).calls == 0


@pytest.mark.asyncio
async def test_the_verdict_is_cached_for_the_same_visitor(monkeypatch, redis):
    client = _client_returning(BLOCK)
    monkeypatch.setattr(verdict_mod, "_get_client", lambda: client)

    for _ in range(3):
        out = await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
        assert out["is_bot"] is True

    # One network call for three clicks from the same visitor.
    assert type(client).calls == 1


@pytest.mark.asyncio
async def test_a_different_visitor_is_looked_up_separately(monkeypatch, redis):
    client = _client_returning(BLOCK)
    monkeypatch.setattr(verdict_mod, "_get_client", lambda: client)

    await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
    await verdict_mod.get_verdict(redis, "r.example.com", "promo", "9.9.9.9", "curl/8")
    await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "Mozilla/5.0")

    assert type(client).calls == 3


@pytest.mark.asyncio
async def test_a_broken_cache_does_not_break_the_request(monkeypatch, redis):
    class _BrokenRedis:
        async def get(self, *a, **k):
            raise RuntimeError("redis down")

        async def set(self, *a, **k):
            raise RuntimeError("redis down")

    monkeypatch.setattr(verdict_mod, "_get_client", lambda: _client_returning(BLOCK))
    out = await verdict_mod.get_verdict(_BrokenRedis(), "r.example.com", "promo", "1.2.3.4", "curl/8")
    assert out["is_bot"] is True


@pytest.mark.asyncio
async def test_cache_key_separates_slugs(redis):
    a = verdict_mod._cache_key("r.example.com", "promo", "1.2.3.4", "curl/8")
    b = verdict_mod._cache_key("r.example.com", "other", "1.2.3.4", "curl/8")
    assert a != b


@pytest.mark.asyncio
async def test_cached_payload_round_trips(monkeypatch, redis):
    monkeypatch.setattr(verdict_mod, "_get_client", lambda: _client_returning(BLOCK))
    await verdict_mod.get_verdict(redis, "r.example.com", "promo", "1.2.3.4", "curl/8")
    raw = await redis.get(verdict_mod._cache_key("r.example.com", "promo", "1.2.3.4", "curl/8"))
    assert json.loads(raw)["is_bot"] is True
