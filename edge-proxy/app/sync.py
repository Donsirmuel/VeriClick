"""Background sync loop — pulls routes, blocked IPs, country rules, and site
configs from the backend every SYNC_INTERVAL seconds and caches them in Redis."""

import asyncio
import json
import logging
import re
from typing import Optional

import httpx
import redis.asyncio as aioredis

from .config import settings

logger = logging.getLogger("edge.sync")

# Set of route keys written by the last sync, so the next one can remove
# whatever is no longer active.
ROUTE_INDEX = "routes:index"

SYNC_URL = f"{settings.BACKEND_URL}/api/edge/sync/"
HEADERS = {"X-Edge-Api-Key": settings.EDGE_API_KEY}

_CAMEL_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")


def _snake(key: str) -> str:
    """`destinationUrl` -> `destination_url`. Already-snake keys pass through."""
    return _CAMEL_BOUNDARY.sub("_", key).lower()


def normalize_keys(value):
    """Recursively convert camelCase keys to snake_case.

    The backend renders every response through CamelCaseJSONRenderer, while the
    edge speaks snake_case throughout. Normalising once here — rather than at
    each call site — means a new field added upstream cannot silently read as
    None and take the whole redirect path down with it.
    """
    if isinstance(value, dict):
        return {_snake(k): normalize_keys(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normalize_keys(v) for v in value]
    return value


async def sync_loop(redis: aioredis.Redis):
    """Run forever: fetch from backend, write to Redis."""
    while True:
        try:
            await _sync_once(redis)
        except Exception:
            logger.exception("Sync failed")
        await asyncio.sleep(settings.SYNC_INTERVAL)


async def _sync_once(redis: aioredis.Redis):
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(SYNC_URL, headers=HEADERS)
        resp.raise_for_status()
        data = normalize_keys(resp.json())

    pipe = redis.pipeline()

    # Routes: one key per "routes:{domain}:{slug}".
    #
    # The active set was collected here and never used, so a route that stopped
    # being active — deactivated, deleted, expired — kept serving until its TTL
    # ran out, up to three sync intervals later. Deactivating a link has to take
    # effect on the next sync, not minutes afterwards, so stale keys are removed
    # explicitly by diffing against the previous set.
    active_route_keys = set()
    for route in data.get("routes", []):
        domain = route["domain"]
        slug = route.get("slug", "")
        key = f"routes:{domain}:{slug}"
        active_route_keys.add(key)
        pipe.set(key, json.dumps(route), ex=settings.SYNC_INTERVAL * 3)

    previous = await redis.smembers(ROUTE_INDEX) or set()
    stale = previous - active_route_keys
    if stale:
        pipe.delete(*stale)
        pipe.srem(ROUTE_INDEX, *stale)
    if active_route_keys:
        pipe.sadd(ROUTE_INDEX, *active_route_keys)
    # The index must outlive the keys it tracks, or stale entries become
    # invisible and undeletable.
    pipe.expire(ROUTE_INDEX, settings.SYNC_INTERVAL * 10)

    # Blocked IPs: set
    pipe.delete("blocked_ips")
    for ip in data.get("blocked_ips", []):
        pipe.sadd("blocked_ips", ip)
    pipe.expire("blocked_ips", settings.SYNC_INTERVAL * 3)

    # Country rules: list
    pipe.delete("country_rules")
    for rule in data.get("country_rules", []):
        pipe.rpush("country_rules", json.dumps(rule))
    pipe.expire("country_rules", settings.SYNC_INTERVAL * 3)

    # Site configs: hash keyed by workspace_id
    for cfg in data.get("site_configs", []):
        wid = cfg["workspace_id"]
        key = f"site_configs:{wid}"
        pipe.set(key, json.dumps(cfg), ex=settings.SYNC_INTERVAL * 3)

    # Store sync token
    pipe.set("sync_token", data.get("sync_token", 0))

    await pipe.execute()
    logger.info(
        "Synced %d routes, %d blocked IPs, %d country rules",
        len(data.get("routes", [])),
        len(data.get("blocked_ips", [])),
        len(data.get("country_rules", [])),
    )


async def get_route(redis: aioredis.Redis, domain: str, slug: str) -> Optional[dict]:
    """Look up a route from Redis cache."""
    raw = await redis.get(f"routes:{domain}:{slug}")
    if raw:
        return json.loads(raw)
    return None


async def get_blocked_ips(redis: aioredis.Redis) -> set:
    """Return the set of blocked IPs."""
    return await redis.smembers("blocked_ips")


async def get_country_rules(redis: aioredis.Redis) -> list:
    """Return the list of country rules."""
    raw = await redis.lrange("country_rules", 0, -1)
    return [json.loads(r) for r in raw]


async def get_site_config(redis: aioredis.Redis, workspace_id: str) -> Optional[dict]:
    """Return site config for a workspace."""
    raw = await redis.get(f"site_configs:{workspace_id}")
    if raw:
        return json.loads(raw)
    return None
