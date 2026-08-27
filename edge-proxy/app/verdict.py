"""Ask the backend to classify a visitor.

The edge used to decide alone with two signals — the IP blocklist and country
rules — while the script path ran the full chain. Same rule, different answer
depending on which product the visitor hit, and "Honeypot" caught nothing but
blocked IPs.

This sits in front of every click, so it is built to get out of the way:
a hard timeout, a short cache, and fail-open on anything unexpected. A slow or
unreachable backend must never stop a paying customer's link from working.
"""

import asyncio
import hashlib
import json
import logging
from typing import Optional

import httpx
import redis.asyncio as aioredis

from .config import settings

logger = logging.getLogger("edge.verdict")

VERDICT_URL = f"{settings.BACKEND_URL}/api/edge/verdict/"
HEADERS = {"X-Edge-Api-Key": settings.EDGE_API_KEY}

# Fail open: what a visitor gets when we cannot reach or trust the backend.
ALLOW = {"is_bot": False, "decision": "allowed", "reason": "verdict-unavailable"}

_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    """One pooled client. Building a client per request would add a TCP and TLS
    handshake to every click, which is most of the latency budget."""
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.VERDICT_TIMEOUT),
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
        )
    return _client


async def close_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _cache_key(domain: str, slug: str, ip: str, user_agent: str) -> str:
    # The verdict depends on the visitor, not the moment. Hash the UA so the key
    # stays short and bounded.
    ua = hashlib.sha256(user_agent.encode("utf-8", "ignore")).hexdigest()[:16]
    return f"verdict:{domain}:{slug}:{ip}:{ua}"


async def get_verdict(
    redis: aioredis.Redis,
    domain: str,
    slug: str,
    ip: str,
    user_agent: str,
    cookies: str = "",
) -> dict:
    """Classify a visitor, or allow them if we cannot.

    Every failure path returns ALLOW rather than raising. Blocking real people
    because a health check blipped is far worse than letting a bot through.
    """
    if not settings.EDGE_API_KEY:
        return ALLOW

    key = _cache_key(domain, slug, ip, user_agent)

    try:
        cached = await redis.get(key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass  # A cache miss is never a reason to fail the request.

    try:
        headers = dict(HEADERS)
        if cookies:
            headers["Cookie"] = cookies
        resp = await _get_client().post(
            VERDICT_URL,
            json={"domain": domain, "slug": slug, "ip": ip, "user_agent": user_agent},
            headers=headers,
        )
        if resp.status_code != 200:
            logger.warning("Verdict returned %s for %s", resp.status_code, domain)
            return ALLOW
        verdict = resp.json()
    except (httpx.TimeoutException, asyncio.TimeoutError):
        logger.warning("Verdict timed out for %s — allowing", domain)
        return ALLOW
    except Exception:
        logger.exception("Verdict call failed for %s — allowing", domain)
        return ALLOW

    if not isinstance(verdict, dict) or "is_bot" not in verdict:
        return ALLOW

    try:
        await redis.set(key, json.dumps(verdict), ex=settings.VERDICT_CACHE_TTL)
    except Exception:
        pass

    return verdict
