"""Request-handling behaviour: expiry, IP/country blocking, and the bot_action
branches. None of this had coverage, which is how time.fromisoformat survived."""

from datetime import datetime, timedelta, timezone

import fakeredis.aioredis
import pytest

from app import routes


# --------------------------------------------------------------------------
# Expiry
# --------------------------------------------------------------------------

def test_expiry_accepts_iso_with_z_suffix():
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    assert routes._is_expired(past) is True


def test_future_expiry_is_not_expired():
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat().replace("+00:00", "Z")
    assert routes._is_expired(future) is False


def test_missing_expiry_is_not_expired():
    assert routes._is_expired(None) is False
    assert routes._is_expired("") is False


def test_malformed_expiry_fails_open():
    # A garbled timestamp must not take a paying customer's link offline.
    assert routes._is_expired("not-a-date") is False


def test_naive_timestamp_does_not_raise():
    # datetime.now(None) vs an aware value would raise TypeError if compared
    # carelessly; both branches must stay comparable.
    past = (datetime.now() - timedelta(days=1)).isoformat()
    assert routes._is_expired(past) is True


# --------------------------------------------------------------------------
# IP blocking
# --------------------------------------------------------------------------

def test_exact_ip_match_is_blocked():
    assert routes._is_ip_blocked("1.2.3.4", {"1.2.3.4"}) is True


def test_cidr_range_is_blocked():
    assert routes._is_ip_blocked("10.1.2.3", {"10.0.0.0/8"}) is True


def test_ip_outside_range_is_allowed():
    assert routes._is_ip_blocked("192.168.1.1", {"10.0.0.0/8"}) is False


def test_malformed_blocklist_entry_is_skipped():
    assert routes._is_ip_blocked("1.2.3.4", {"garbage", "1.2.3.4"}) is True


# --------------------------------------------------------------------------
# Country rules
# --------------------------------------------------------------------------

def test_country_rule_matches_case_insensitively():
    rules = [{"country_code": "cn", "action": "deny"}]
    assert routes._is_country_blocked("CN", rules) == "deny"


def test_unknown_country_is_not_blocked():
    rules = [{"country_code": "CN", "action": "deny"}]
    assert routes._is_country_blocked("US", rules) is None
    assert routes._is_country_blocked(None, rules) is None


# --------------------------------------------------------------------------
# Full request path
# --------------------------------------------------------------------------

class _FakeBatcher:
    def __init__(self):
        self.events = []

    async def queue(self, event):
        self.events.append(event)


def _request(host="go.example.com", path="/sale", ip="9.9.9.9"):
    class _Req:
        headers = {"host": host, "user-agent": "curl/8", "x-forwarded-for": ip}

        class url:
            pass

        client = None

    req = _Req()
    req.url.path = path
    return req


async def _seed(redis, **overrides):
    import json
    route = {
        "domain": "go.example.com",
        "slug": "sale",
        "destination_url": "https://target.example.com/landing",
        "bot_action": "honeypot",
        "expires_at": None,
        "is_active": True,
    }
    route.update(overrides)
    await redis.set("routes:go.example.com:sale", json.dumps(route))


@pytest.mark.asyncio
async def test_human_traffic_redirects_to_the_destination():
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    await _seed(redis)
    resp = await routes.handle_request(_request(), redis, _FakeBatcher())
    assert resp.status_code == 302
    # The regression that mattered: an empty Location header.
    assert resp.headers["location"] == "https://target.example.com/landing"


@pytest.mark.asyncio
async def test_expired_route_serves_neutral_instead_of_redirecting():
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat().replace("+00:00", "Z")
    await _seed(redis, expires_at=past)
    resp = await routes.handle_request(_request(), redis, _FakeBatcher())
    assert resp.status_code == 200
    assert "location" not in resp.headers


@pytest.mark.asyncio
async def test_blocked_ip_gets_the_configured_bot_action():
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    await _seed(redis, bot_action="honeypot")
    await redis.sadd("blocked_ips", "9.9.9.9")
    resp = await routes.handle_request(_request(ip="9.9.9.9"), redis, _FakeBatcher())
    # Honeypot renders a page rather than redirecting to the real destination.
    assert resp.status_code == 200
    assert "location" not in resp.headers


@pytest.mark.asyncio
async def test_unknown_route_serves_neutral():
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    resp = await routes.handle_request(_request(path="/nope"), redis, _FakeBatcher())
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_a_bot_verdict_stops_the_redirect(monkeypatch):
    """The point of the shared engine: a bot with a clean IP used to sail
    straight through to the destination."""
    from app import routes as routes_mod

    async def _bot(*a, **k):
        return {"is_bot": True, "decision": "blocked", "reason": "Suspicious UA"}

    monkeypatch.setattr(routes_mod, "get_verdict", _bot)
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    await _seed(redis, bot_action="honeypot")

    resp = await routes.handle_request(_request(), redis, _FakeBatcher())
    assert resp.status_code == 200          # honeypot page
    assert "location" not in resp.headers   # not forwarded to the destination


@pytest.mark.asyncio
async def test_a_human_verdict_still_redirects(monkeypatch):
    from app import routes as routes_mod

    async def _human(*a, **k):
        return {"is_bot": False, "decision": "allowed", "reason": ""}

    monkeypatch.setattr(routes_mod, "get_verdict", _human)
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    await _seed(redis)

    resp = await routes.handle_request(_request(), redis, _FakeBatcher())
    assert resp.status_code == 302
    assert resp.headers["location"] == "https://target.example.com/landing"


@pytest.mark.asyncio
async def test_an_unavailable_verdict_still_redirects(monkeypatch):
    # Fail open all the way through the request path, not just in the client.
    from app import routes as routes_mod

    async def _unavailable(*a, **k):
        return {"is_bot": False, "decision": "allowed", "reason": "verdict-unavailable"}

    monkeypatch.setattr(routes_mod, "get_verdict", _unavailable)
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    await _seed(redis)

    resp = await routes.handle_request(_request(), redis, _FakeBatcher())
    assert resp.status_code == 302


@pytest.mark.asyncio
async def test_raw_ip_host_is_refused():
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    resp = await routes.handle_request(_request(host="203.0.113.9"), redis, _FakeBatcher())
    assert resp.status_code == 444


@pytest.mark.asyncio
async def test_an_inactive_route_does_not_redirect():
    """Defence in depth: if a stale key survives a failed sync, a route the
    backend has marked inactive must still not serve."""
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
    await _seed(redis, is_active=False)
    resp = await routes.handle_request(_request(), redis, _FakeBatcher())
    assert resp.status_code == 200
    assert "location" not in resp.headers
