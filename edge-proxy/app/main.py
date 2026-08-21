"""Edge proxy — FastAPI application.

Receives traffic from Caddy after TLS termination. Caddy handles on-demand
TLS by calling the backend's /api/edge/validate-domain/ endpoint.
"""

import asyncio
import logging

import redis.asyncio as aioredis
from fastapi import FastAPI, Request, Response
from fastapi.responses import PlainTextResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from . import geo
from .events import EventBatcher
from .routes import handle_request
from .sync import sync_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("edge")

app = FastAPI(title="VeriClick Edge Proxy", docs_url=None, redoc_url=None)


class StripServerHeadersMiddleware(BaseHTTPMiddleware):
    """Remove Server and X-Powered-By headers from all responses."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for h in ("server", "x-powered-by"):
            if h in response.headers:
                del response.headers[h]
        return response


app.add_middleware(StripServerHeadersMiddleware)

# Shared state
_redis: aioredis.Redis | None = None
_batcher: EventBatcher | None = None


@app.on_event("startup")
async def startup():
    global _redis, _batcher

    _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    _batcher = EventBatcher(_redis)

    # Initialize GeoIP
    geo.init(settings.GEOIP2_DB)

    # Start background tasks
    asyncio.create_task(sync_loop(_redis))
    asyncio.create_task(_batcher.flush_loop())

    logger.info(
        "Edge proxy started: backend=%s redis=%s",
        settings.BACKEND_URL,
        settings.REDIS_URL,
    )


@app.on_event("shutdown")
async def shutdown():
    if _batcher:
        await _batcher._flush()
    if _redis:
        await _redis.close()


# Registered BEFORE the catch-all: Starlette matches routes in definition
# order, so declaring /health afterwards makes it unreachable.
@app.get("/health")
async def health():
    return PlainTextResponse("ok")


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def catch_all(request: Request, path: str = "") -> Response:
    return await handle_request(request, _redis, _batcher)
