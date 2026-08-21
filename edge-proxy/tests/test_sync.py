"""The sync boundary is where the backend's camelCase JSON meets the edge's
snake_case code. Every field that crossed it silently read as None before
normalize_keys existed, which took the whole redirect path down."""

import json

import fakeredis.aioredis
import pytest

from app import sync


# A verbatim /api/edge/sync/ response, as CamelCaseJSONRenderer emits it.
BACKEND_PAYLOAD = {
    "syncToken": 1787241251,
    "routes": [
        {
            "domain": "go.example.com",
            "slug": "sale",
            "destinationUrl": "https://target.example.com/landing",
            "isActive": True,
            "botAction": "honeypot",
            "fallbackUrl": "",
            "expiresAt": "2099-01-01T00:00:00Z",
        }
    ],
    "blockedIps": ["1.2.3.4", "10.0.0.0/8"],
    "countryRules": [{"countryCode": "CN", "action": "deny"}],
    "siteConfigs": [{"workspaceId": "ws-1", "protectionMode": "balanced"}],
}


def test_snake_converts_camel_case():
    assert sync._snake("destinationUrl") == "destination_url"
    assert sync._snake("syncToken") == "sync_token"


def test_snake_leaves_existing_snake_case_alone():
    assert sync._snake("destination_url") == "destination_url"
    assert sync._snake("domain") == "domain"


def test_normalize_keys_recurses_into_lists_and_dicts():
    out = sync.normalize_keys(BACKEND_PAYLOAD)

    assert out["sync_token"] == 1787241251
    assert out["blocked_ips"] == ["1.2.3.4", "10.0.0.0/8"]
    assert out["country_rules"][0]["country_code"] == "CN"
    assert out["site_configs"][0]["workspace_id"] == "ws-1"

    route = out["routes"][0]
    assert route["destination_url"] == "https://target.example.com/landing"
    assert route["bot_action"] == "honeypot"
    assert route["expires_at"] == "2099-01-01T00:00:00Z"
    assert route["is_active"] is True


def test_normalize_keys_leaves_scalars_untouched():
    # Values must never be rewritten — only keys.
    out = sync.normalize_keys({"destinationUrl": "https://Example.COM/AbC"})
    assert out["destination_url"] == "https://Example.COM/AbC"


@pytest.mark.asyncio
async def test_sync_once_writes_usable_values_to_redis(monkeypatch):
    """End-to-end: a camelCase backend response must land in Redis in the
    shape routes.py actually reads."""
    redis = fakeredis.aioredis.FakeRedis(decode_responses=True)

    class _Resp:
        def raise_for_status(self):
            return None

        def json(self):
            return BACKEND_PAYLOAD

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, headers=None):
            return _Resp()

    monkeypatch.setattr(sync.httpx, "AsyncClient", lambda **kw: _Client())

    await sync._sync_once(redis)

    route = await sync.get_route(redis, "go.example.com", "sale")
    assert route is not None
    # The three fields that were silently empty in production.
    assert route["destination_url"] == "https://target.example.com/landing"
    assert route["bot_action"] == "honeypot"
    assert route["expires_at"] == "2099-01-01T00:00:00Z"

    assert await sync.get_blocked_ips(redis) == {"1.2.3.4", "10.0.0.0/8"}
    assert (await sync.get_country_rules(redis))[0]["country_code"] == "CN"
    assert json.loads(await redis.get("site_configs:ws-1"))["protection_mode"] == "balanced"
