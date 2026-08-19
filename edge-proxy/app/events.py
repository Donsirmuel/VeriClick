"""Event batcher — collects redirect events in memory and pushes them to the
backend in batches every EVENT_BATCH_INTERVAL seconds."""

import asyncio
import logging
from typing import Optional

import httpx
import redis.asyncio as aioredis

from .config import settings

logger = logging.getLogger("edge.events")

EVENTS_URL = f"{settings.BACKEND_URL}/api/edge/events/"
HEADERS = {"X-Edge-Api-Key": settings.EDGE_API_KEY}


class EventBatcher:
    def __init__(self, redis: aioredis.Redis):
        self.redis = redis
        self.events: list[dict] = []
        self._lock = asyncio.Lock()

    async def queue(self, event: dict):
        """Add an event to the batch."""
        async with self._lock:
            self.events.append(event)

    async def flush_loop(self):
        """Push events to backend every EVENT_BATCH_INTERVAL seconds."""
        while True:
            await asyncio.sleep(settings.EVENT_BATCH_INTERVAL)
            await self._flush()

    async def _flush(self):
        async with self._lock:
            if not self.events:
                return
            batch = self.events[: settings.EVENT_BATCH_SIZE]
            self.events = self.events[settings.EVENT_BATCH_SIZE :]

        if not batch:
            return

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    EVENTS_URL,
                    json={"events": batch},
                    headers=HEADERS,
                )
                resp.raise_for_status()
                logger.info("Flushed %d events", len(batch))
        except Exception:
            logger.exception("Failed to flush %d events, re-queuing", len(batch))
            async with self._lock:
                self.events = batch + self.events
