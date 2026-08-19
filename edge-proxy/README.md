# VeriClick Edge Proxy

Handles smart redirects for customer domains. Runs on the FlokiNET VPS (`edge.vericlick.cc`).

## Architecture

```
Customer domain (CNAME → edge.vericlick.cc)
  → Caddy (on-demand TLS, calls backend to validate domains)
    → FastAPI (route lookup in Redis, bot classification, redirect/block)
      → Backend API (sync routes, batch events)
```

## Setup

1. Create an `EdgeSyncCredential` via the admin panel or API:
   ```bash
   curl -X POST https://vericlick.site/api/edge/credentials/ \
     -H "Authorization: Bearer <jwt>" \
     -H "Content-Type: application/json" \
     -d '{"label": "FlokiNET DE"}'
   ```
   Copy the raw `ek_` key — it's shown once.

2. Configure:
   ```bash
   cp .env.example .env
   nano .env  # Set BACKEND_URL, EDGE_API_KEY, EDGE_HOSTNAME
   ```

3. Deploy:
   ```bash
   docker compose up -d --build
   ```

4. DNS: CNAME your customer domains to `edge.vericlick.cc`.

## How it works

- **Sync loop:** Every 60s, pulls routes + blocked IPs + country rules from the backend API and caches in Redis.
- **On-demand TLS:** Caddy asks `GET /api/edge/validate-domain/?domain=<domain>` before issuing a cert. Only domains with active routes get certs.
- **Request handling:** Looks up route by domain+slug in Redis, checks IP/country blocks, redirects humans, blocks/traps bots.
- **Event batching:** Every 60s, pushes collected events to `POST /api/edge/events/`.

## Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `BACKEND_URL` | Backend API base URL | `https://vericlick.site` |
| `EDGE_API_KEY` | `ek_` key from credential creation | required |
| `REDIS_URL` | Redis connection | `redis://redis:6379/0` |
| `SYNC_INTERVAL` | Route sync interval (seconds) | `60` |
| `EVENT_BATCH_INTERVAL` | Event push interval (seconds) | `60` |
| `EDGE_HOSTNAME` | This proxy's hostname | `edge.vericlick.cc` |
| `GEOIP2_DB` | Path to GeoLite2-City.mmdb (optional) | empty |
