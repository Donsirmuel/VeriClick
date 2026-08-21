"""Request handler — receives traffic from Caddy after TLS termination,
looks up the route in Redis, classifies bot vs human, and redirects or blocks."""

import ipaddress
import json
import logging
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

import redis.asyncio as aioredis
from fastapi import Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from . import geo, events as events_mod
from .sync import get_route, get_blocked_ips, get_country_rules
from .verdict import get_verdict

logger = logging.getLogger("edge.routes")

# In-memory templates (loaded once at import)
_templates: dict[str, str] = {}


def _load_templates():
    from pathlib import Path

    tpl_dir = Path(__file__).parent / "templates"
    for name in ("block", "honeypot", "neutral"):
        path = tpl_dir / f"{name}.html"
        if path.exists():
            _templates[name] = path.read_text()


_load_templates()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def _is_ip_blocked(ip: str, blocked: set) -> bool:
    if ip in blocked:
        return True
    try:
        addr = ipaddress.ip_address(ip)
        for entry in blocked:
            try:
                if addr in ipaddress.ip_network(entry, strict=False):
                    return True
            except ValueError:
                continue
    except ValueError:
        pass
    return False


def _is_country_blocked(country_code: Optional[str], rules: list) -> Optional[str]:
    """Return the action if the country is blocked, else None."""
    if not country_code:
        return None
    cc = country_code.upper()
    for rule in rules:
        if rule.get("country_code", "").upper() == cc:
            return rule.get("action")
    return None


def _render(name: str) -> HTMLResponse:
    html = _templates.get(name, f"<html><body><h1>{name}</h1></body></html>")
    return HTMLResponse(content=html, status_code=200)


def _is_expired(expires_at) -> bool:
    """Whether a route's expiry has passed.

    An unparseable or missing value is treated as "not expired": a malformed
    timestamp should not silently take a paying customer's link offline.
    """
    if not expires_at:
        return False
    try:
        exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return False
    now = datetime.now(exp.tzinfo) if exp.tzinfo else datetime.now()
    return exp < now


async def handle_request(
    request: Request,
    redis: aioredis.Redis,
    batcher: events_mod.EventBatcher,
) -> Response:
    """Main entry point — called for every incoming request."""
    host = request.headers.get("host", "").split(":")[0].lower()
    path = request.url.path.strip("/")
    slug = path.split("/")[0] if path else ""
    ip = _client_ip(request)
    user_agent = request.headers.get("user-agent", "")

    # Block direct IP access — never serve content when Host is a raw IP
    try:
        ipaddress.ip_address(host)
        return Response(status_code=444)
    except ValueError:
        pass  # Not an IP, continue

    # Look up route in Redis
    route = await get_route(redis, host, slug)

    if not route:
        # No route found — serve neutral page (never expose vericlick.site)
        _queue_event(batcher, host, slug, ip, user_agent, "", "neutral", False)
        return _render("neutral")

    # Check expiry
    if _is_expired(route.get("expires_at")):
        _queue_event(batcher, host, slug, ip, user_agent, "", "expired", False)
        return _render("neutral")

    destination = route.get("destination_url", "")
    bot_action = route.get("bot_action", "block")

    # IP check
    blocked_ips = await get_blocked_ips(redis)
    if _is_ip_blocked(ip, blocked_ips):
        return _apply_action(bot_action, destination, batcher, host, slug, ip, user_agent, is_bot=True)

    # Country check
    country_code = geo.lookup(ip)
    country_rules = await get_country_rules(redis)
    country_action = _is_country_blocked(country_code, country_rules)
    if country_action == "deny":
        return _apply_action(bot_action, destination, batcher, host, slug, ip, user_agent, is_bot=True, country_code=country_code)

    # Everything above is a local rule. Now ask the backend for the same verdict
    # the script path gets — bot user agents, rate limits, datacenter ranges,
    # reputation — so one rule means one thing across both products.
    #
    # Fails open by design: get_verdict returns "allowed" on timeout or error,
    # because a slow check must never take a customer's link offline.
    verdict = await get_verdict(redis, host, slug, ip, user_agent)
    if verdict.get("is_bot"):
        return _apply_action(
            bot_action, destination, batcher, host, slug, ip, user_agent,
            is_bot=True, country_code=country_code,
        )

    # Human traffic — redirect
    _queue_event(batcher, host, slug, ip, user_agent, destination, "allowed", False, country_code=country_code)
    return RedirectResponse(url=destination, status_code=302)


def _apply_action(
    bot_action: str,
    destination: str,
    batcher: events_mod.EventBatcher,
    host: str,
    slug: str,
    ip: str,
    user_agent: str,
    is_bot: bool = True,
    country_code: Optional[str] = None,
) -> Response:
    if bot_action == "redirect" and destination:
        _queue_event(batcher, host, slug, ip, user_agent, destination, "blocked", is_bot, country_code=country_code)
        return RedirectResponse(url=destination, status_code=302)
    elif bot_action == "honeypot":
        _queue_event(batcher, host, slug, ip, user_agent, "", "blocked", is_bot, country_code=country_code)
        return _render("honeypot")
    elif bot_action == "neutral":
        _queue_event(batcher, host, slug, ip, user_agent, "", "blocked", is_bot, country_code=country_code)
        return _render("neutral")
    else:
        # Default: block (404-style)
        _queue_event(batcher, host, slug, ip, user_agent, "", "blocked", is_bot, country_code=country_code)
        return _render("block")


def _queue_event(
    batcher: events_mod.EventBatcher,
    domain: str,
    slug: str,
    ip: str,
    user_agent: str,
    destination: str,
    verdict: str,
    is_bot: bool,
    country_code: Optional[str] = None,
):
    """Fire-and-forget event queueing."""
    import asyncio

    event = {
        "domain": domain,
        "slug": slug,
        "ip": ip,
        "user_agent": user_agent[:512],
        "destination": destination[:2048],
        "verdict": verdict,
        "is_bot": is_bot,
        "country_code": (country_code or "")[:2],
        "country": "",
    }
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(batcher.queue(event))
    except RuntimeError:
        pass
