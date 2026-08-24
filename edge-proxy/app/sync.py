"""Background sync loop — pulls routes (with per-workspace rules embedded)
from the backend every SYNC_INTERVAL seconds and caches them in Redis."""

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
    """Recursively convert camelCase keys to snake_case."""
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
    # Per-workspace rules (blocked_ips, allowed_ips, country_rules,
    # device_policy) are embedded in each route's JSON payload.
    active_route_keys = set()
    for route in data.get("routes", []):
        domain = route["domain"]
        slug = route.get("slug", "")
        key = f"routes:{domain}:{slug}"
        active_route_keys.add(key)
        pipe.set(key, json.dumps(route), ex=settings.SYNC_INTERVAL * 3)

        # Shortlink secondary index: vericlick.cc/<slug> resolves here
        if route.get("use_shortlink") and slug:
            shortlink_key = f"shortlink:{slug}"
            active_route_keys.add(shortlink_key)
            pipe.set(shortlink_key, json.dumps(route), ex=settings.SYNC_INTERVAL * 3)

    previous = await redis.smembers(ROUTE_INDEX) or set()
    stale = previous - active_route_keys
    if stale:
        pipe.delete(*stale)
        pipe.srem(ROUTE_INDEX, *stale)
    if active_route_keys:
        pipe.sadd(ROUTE_INDEX, *active_route_keys)
    pipe.expire(ROUTE_INDEX, settings.SYNC_INTERVAL * 10)

    # Store sync token
    pipe.set("sync_token", data.get("sync_token", 0))

    await pipe.execute()
    logger.info("Synced %d routes", len(data.get("routes", [])))


async def get_route(redis: aioredis.Redis, domain: str, slug: str) -> Optional[dict]:
    """Look up a route from Redis cache."""
    raw = await redis.get(f"routes:{domain}:{slug}")
    if raw:
        return json.loads(raw)
    return None


async def get_shortlink(redis: aioredis.Redis, slug: str) -> Optional[dict]:
    """Look up a shortlink route by slug only (vericlick.cc/<slug>)."""
    raw = await redis.get(f"shortlink:{slug}")
    if raw:
        return json.loads(raw)
    return None
