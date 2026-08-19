# VeriClick — Project Handoff

## Overview

VeriClick is a **script-first bot protection & smart redirect platform**. Customers install a single `<script>` tag on their website; VeriClick's 5-layer detection engine (canvas fingerprint, mouse trajectory, TLS/JA4, proof-of-work, behavioral scoring) classifies every visit and returns a verdict. An optional edge proxy (`vericlick.cc`) handles smart redirects with the same protection.

**Architecture**: `vericlick.site` (InterServer) runs the Django backend + React SPA. `vericlick.cc` (FlokiNET) runs the edge proxy (Python FastAPI + Redis + Caddy). The two never appear in the same public-facing context — `vericlick.site` is never exposed in redirect paths, HTTP headers, DNS records, or SSL certificates.

---

## Backend (`vericlick-backend/`)

### Stack
- **Python 3.13**, Django 6.0.2, DRF 3.16.1
- `djangorestframework-simplejwt` for JWT auth
- `django-cors-headers`, `django-filter`, `python-decouple`, `dnspython`
- Dependencies in `requirements.txt`

### Models

| Model | Purpose |
|---|---|
| `Workspace` | Tenant container. Owner, plan, billing state, tracker_secret (UUID), plan lifecycle (active/grace/suspended) |
| `DomainRegistry` | Domain ownership with verification (`html_meta` or `dns_txt`), health status, purpose (`protection` or `redirect`) |
| `InstallToken` | SHA-256 hashed, `vc_` prefix, shown once on create. Used by `shield.js` to authenticate without exposing workspace secrets |
| `ShieldConfig` | Per-workspace protection mode (strict/balanced/monitor), bot action (block/honeypot/log), path rules, rate limit |
| `RedirectRoute` | OneToOneField to DomainRegistry. Slug, destination, bot_action (honeypot/block/neutral/redirect), 7-day expiry |
| `RedirectEvent` | Click analytics from edge proxy batch-push |
| `EdgeSyncCredential` | SHA-256 hashed `ek_` keys, max 2 per workspace. Authenticates edge → backend API |
| `IPRule` | Allow/deny IP rules (single IP or CIDR) |
| `CountryRule` | Country-level allow/deny |
| `TrackerEvent` | Individual visit log with full bot detection signals |

### Key API Endpoints

#### Public (AllowAny)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health/` | Health check |
| `GET` | `/api/tracker.js` | Legacy site script (deprecated, backward compat) |
| `POST` | `/api/tracker/event/` | Legacy tracker event ingest (deprecated) |
| `POST` | `/api/shield/verify/` | Core verification — accepts `api_key` or `install_token`, returns verdict |
| `GET` | `/api/shield/config/` | Shield config for script — accepts `api_key` or `install_token` query param |
| `POST` | `/api/shield/telemetry/` | Batch telemetry from script |

#### Edge Proxy (AllowAny, authenticated via `X-Edge-Api-Key`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/edge/sync/` | Routes, blocked IPs, country rules, site configs |
| `GET` | `/api/edge/validate-domain/` | Caddy on-demand TLS check — returns 200 if domain has active redirect route |
| `POST` | `/api/edge/events/` | Batch push click events from edge proxy |

#### Auth-required (workspace-scoped)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/me/` | Current user |
| `GET`/`PATCH` | `/api/workspace/` | Workspace detail |
| `GET` | `/api/dashboard/stats/` | 24h visit stats, bot %, protection mode |
| `GET` | `/api/dashboard/traffic/` | Daily traffic (human/bot) |
| `GET` | `/api/dashboard/activity/` | Recent visits with metadata |
| CRUD | `/api/domains/` | Domain registry |
| `GET` | `/api/domains/{id}/verify-challenge/` | Get verification challenge (meta tag or DNS TXT) |
| `POST` | `/api/domains/{id}/verify-confirm/` | Verify domain ownership via live check |
| `POST` | `/api/domains/{id}/recheck/` | Re-run health check |
| CRUD | `/api/ip-rules/` | IP allow/deny rules |
| CRUD | `/api/country-rules/` | Country allow/deny rules |
| `GET`/`POST` | `/api/install-tokens/` | List/generate install tokens (max 5 active) |
| `DELETE` | `/api/install-tokens/{id}/` | Revoke install token |
| `GET`/`POST` | `/api/redirect-domains/` | List/add redirect-purpose domains |
| `GET`/`POST` | `/api/redirect-routes/` | List/create redirect routes |
| `GET`/`PATCH`/`DELETE` | `/api/redirect-routes/{id}/` | Get/update/delete route |
| `POST` | `/api/redirect-routes/{id}/renew/` | Renew route for 7 more days |
| `POST` | `/api/redirect-routes/{id}/activate/` | Re-activate a disabled route |
| `POST` | `/api/redirect-routes/{id}/deactivate/` | Deactivate a route |
| `GET`/`POST` | `/api/edge/credentials/` | List/create edge sync credentials (max 2) |
| `DELETE` | `/api/edge/credentials/{id}/` | Revoke edge credential |
| `POST` | `/api/test-installation/` | Check if script is present on a domain |

### 5-Layer Bot Detection
1. **Canvas fingerprint** — detect headless browsers with missing/abnormal canvas
2. **Mouse trajectory** — analyze movement patterns for bot signatures
3. **TLS/JA4 fingerprinting** — JA3/JA4 hashes detect automated HTTP clients
4. **Proof-of-work** — computational challenge verifies real browser
5. **Behavioral scoring** — composite score (0.0 bot → 1.0 human)

### Plan Lifecycle
- `active` → paid period in force (full access)
- `grace` → period lapsed, 7-day grace window (full access)
- `suspended` → grace passed, protection inactive until renewal

### Background Tasks
- `check_redirect_expiry` — daily cron, sends warning emails 1 day before + day of redirect expiry, auto-deactivates expired routes
- `check_domains` — optional periodic domain health scanner

### Error Format
All errors: `{"errors": [{"field": ..., "detail": ...}]}`

### Security
- Throttling: anonymous 100/hr, authenticated 1000/hr, tracker 600/min
- Production: HSTS 1yr, SSL redirect, secure cookies, nosniff
- `SECURE_PROXY_SSL_HEADER` only when `TRUST_X_FORWARDED_PROTO=true`
- Install tokens: SHA-256 hashed, raw shown once, `vc_` prefix
- Edge credentials: SHA-256 hashed, `ek_` prefix, max 2 per workspace

### Testing
- 263 tests in `vericlick/tests.py`
- Dev: `python manage.py test` (SQLite)
- CI: `python manage.py test --settings=Vericlick_project.settings_test`
- Covers: all models, endpoints (CRUD, auth, edge cases), shield verify/config with both api_key and install_token, domain verification (meta + DNS), install token lifecycle, redirect route CRUD + renew/activate/deactivate, edge sync/validate/events, credential management, test installation, plan lifecycle (active/grace/suspended)

---

## Frontend (`vericlick-frontend/`)

### Stack
- **React 19**, Vite 8 (rolldown), TypeScript, Tailwind CSS 4
- `@tanstack/react-query` v5, `axios`, `react-router-dom` v7, `react-hot-toast`
- `react-hook-form` + `zod`, `recharts`, `@hugeicons/core-free-icons`

### Key Pages
| Path | Page |
|---|---|
| `/app/dashboard` | Stats, traffic chart, activity feed |
| `/app/install` | Domain selector, platform selector (Shopify/Wix/Squarespace/Webflow/WordPress/Other), script snippet, test installation |
| `/app/domains` | Domain management with verification modal (meta tag or DNS TXT), health badges, install token management |
| `/app/redirects` | Redirect route management with 3-step creation wizard |
| `/app/ip-rules` | IP allow/deny rules |
| `/app/country-rules` | Country allow/deny rules |
| `/app/blocked-ips` | Blocked traffic review queue |
| `/app/settings` | Workspace settings, billing |
| `/app/plans` | Plan management |

### Auth Flow
1. JWT `access` + `refresh` in `localStorage`
2. `axios` interceptor adds `Bearer` header; on 401 attempts refresh; on failure clears and redirects to login
3. Google OAuth optional (requires `VITE_GOOGLE_CLIENT_ID`)

---

## Edge Proxy (`vericlick.cc`)

### Architecture
- **Python FastAPI** + Redis + Caddy v2 (custom build with JA4 plugin)
- Deployed on FlokiNET (`node1.sys-edge.net`)
- Cache-first design: syncs routes from backend API every 60 seconds
- Neutral fallback: unknown domains get a clean page (never expose `vericlick.site`)

### Flow
1. Caddy receives HTTPS request on port 443
2. On-demand TLS: Caddy calls `/api/edge/validate-domain/` to check if domain should get a cert
3. Request passes through FastAPI app
4. Route lookup (Redis cache → backend API fallback)
5. Bot detection + IP/country rule matching
6. Human traffic → 302 redirect to destination
7. Bot traffic → honeypot/block/neutral/redirect based on route config
8. Events batched and pushed to `/api/edge/events/` every 60 seconds

---

## Domain Architecture

### Two domain types

| Type | Purpose | Public-facing |
|---|---|---|
| `protection` | Customer's own site protected by shield.js script | Customer's domain |
| `redirect` | Customer's domain for smart redirects via edge proxy | CNAMEs to `edge.vericlick.cc` |

### Security rule
`vericlick.site` never appears in any public redirect path, HTTP header, DNS record, or SSL certificate.

### Verification methods
- **HTML meta tag** (primary): `<meta name="vericlick-verification" content="<token>">`
- **DNS TXT record** (fallback): `_vericlick-challenge.<domain>` → `vericlick-verify=<token>`
