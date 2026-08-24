"""Request handler — receives traffic from Caddy after TLS termination,
looks up the route in Redis, enforces per-workspace rules, classifies bot
vs human via the backend verdict, and redirects or blocks."""

import ipaddress
import json
import logging
from datetime import datetime
from typing import Optional

import redis.asyncio as aioredis
from fastapi import Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from . import geo, events as events_mod
from .sync import get_route, get_shortlink
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


def _ip_matches_cidr(ip_str: str, cidr_str: str) -> bool:
    """Check if an IP matches a CIDR or single IP."""
    try:
        ip = ipaddress.ip_address(ip_str)
        network = ipaddress.ip_network(cidr_str, strict=False)
        return ip in network
    except (ValueError, TypeError):
        return False


def _is_ip_blocked(ip: str, blocked_ips: list) -> bool:
    for entry in blocked_ips:
        if _ip_matches_cidr(ip, entry):
            return True
    return False


def _is_ip_allowed(ip: str, allowed_ips: list) -> bool:
    for entry in allowed_ips:
        if _ip_matches_cidr(ip, entry):
            return True
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
    """Whether a route's expiry has passed."""
    if not expires_at:
        return False
    try:
        exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return False
    now = datetime.now(exp.tzinfo) if exp.tzinfo else datetime.now()
    return exp < now


def _parse_ua_device(user_agent: str) -> dict:
    """Lightweight UA parsing for device/OS checks on the edge.

    Uses keyword matching rather than a full parser library to keep the
    edge proxy dependency-free and fast. Good enough for allow/block
    decisions on device class and OS family.
    """
    ua = user_agent.lower()
    is_bot = not user_agent.strip()

    # Device class
    if any(kw in ua for kw in ("mobile", "android", "iphone", "ipod")):
        device_class = "mobile"
    elif any(kw in ua for kw in ("ipad", "tablet", "kindle", "silk")):
        device_class = "tablet"
    elif is_bot:
        device_class = "bot"
    else:
        device_class = "desktop"

    # OS family
    if "windows" in ua:
        os_family = "Windows"
    elif "mac os" in ua or ("macintosh" in ua and "iphone" not in ua and "ipad" not in ua):
        os_family = "macOS"
    elif "iphone" in ua or "ipad" in ua or "ipod" in ua:
        os_family = "iOS"
    elif "android" in ua:
        os_family = "Android"
    elif "linux" in ua:
        os_family = "Linux"
    else:
        os_family = "Other"

    return {"device_class": device_class, "os_family": os_family, "is_bot": is_bot}


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

    # Look up route in Redis — try domain+slug first, then shortlink
    route = await get_route(redis, host, slug)

    if not route and slug:
        # Shortlink: vericlick.cc/<slug> — resolve by slug alone
        route = await get_shortlink(redis, slug)
        if route:
            host = "vericlick.cc"  # Normalize host for event tracking

    if not route:
        # No route found — serve neutral page (never expose vericlick.site)
        _queue_event(batcher, host, slug, ip, user_agent, "", "neutral", False)
        return _render("neutral")

    # Check expiry
    if _is_expired(route.get("expires_at")):
        _queue_event(batcher, host, slug, ip, user_agent, "", "expired", False)
        return _render("neutral")

    # Defence in depth: even if a stale key survives a sync failure, a route
    # the backend has marked inactive must not serve.
    if route.get("is_active") is False:
        _queue_event(batcher, host, slug, ip, user_agent, "", "inactive", False)
        return _render("neutral")

    destination = route.get("destination_url", "")
    bot_action = route.get("bot_action", "block")

    # --- Per-workspace rule enforcement (from route data) ---

    # 1. IP allow list (highest priority — allow always wins)
    allowed_ips = route.get("allowed_ips", [])
    if allowed_ips and _is_ip_allowed(ip, allowed_ips):
        _queue_event(batcher, host, slug, ip, user_agent, destination, "allowed", False)
        return RedirectResponse(url=destination, status_code=302)

    # 2. IP deny list
    blocked_ips = route.get("blocked_ips", [])
    if _is_ip_blocked(ip, blocked_ips):
        return _apply_action(bot_action, destination, batcher, host, slug, ip, user_agent, is_bot=True)

    # 3. Country rules (allow wins over deny)
    country_code = geo.lookup(ip)
    country_rules = route.get("country_rules", [])
    if country_code:
        cc = country_code.upper()
        allow_country = False
        deny_country = False
        for rule in country_rules:
            if rule.get("country_code", "").upper() == cc:
                if rule.get("action") == "allow":
                    allow_country = True
                elif rule.get("action") == "deny":
                    deny_country = True
        if allow_country:
            _queue_event(batcher, host, slug, ip, user_agent, destination, "allowed", False)
            return RedirectResponse(url=destination, status_code=302)
        if deny_country:
            return _apply_action(bot_action, destination, batcher, host, slug, ip, user_agent, is_bot=True, country_code=country_code)

    # 4. Device policy
    device_policy = route.get("device_policy", {})
    allowed_classes = device_policy.get("allowed_device_classes", [])
    blocked_os = device_policy.get("blocked_os_families", [])
    if allowed_classes or blocked_os:
        device_info = _parse_ua_device(user_agent)
        if allowed_classes and device_info["device_class"] not in allowed_classes:
            return _apply_action(bot_action, destination, batcher, host, slug, ip, user_agent, is_bot=True)
        if blocked_os and device_info["os_family"] in blocked_os:
            return _apply_action(bot_action, destination, batcher, host, slug, ip, user_agent, is_bot=True)

    # --- Backend verdict for full classification ---
    # Fails open by design: get_verdict returns "allowed" on timeout or error.
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
