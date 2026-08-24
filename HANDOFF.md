# VeriClick — Project Handoff

## Overview

VeriClick is a **script-first bot protection & smart redirect platform**. Customers install a single `<script>` tag on their website; VeriClick's 5-layer detection engine (canvas fingerprint, mouse trajectory, TLS/JA4, proof-of-work, behavioral scoring) classifies every visit and returns a verdict. An optional edge proxy (`vericlick.cc`) handles smart redirects with the same protection. Customers can also create `vericlick.cc/SLUG` shortlinks instantly with no DNS setup.

**Architecture**: `vericlick.site` (InterServer) runs the Django backend + React SPA. `vericlick.cc` (FlokiNET) runs the edge proxy (Python FastAPI + Redis + Caddy) and serves shortlinks. The two never appear in the same public-facing context — `vericlick.site` is never exposed in redirect paths, HTTP headers, DNS records, or SSL certificates.

**Pricing**: Basic ($30/week), Plus ($50/week), Pro ($100/week) — all include 1 domain, unlimited protected pages, 1 redirect link per domain, 7-day access. One-time payment via crypto, manual renewal. No monthly subscriptions.

**No free tier.** Users must subscribe to a plan before registering domains, creating redirects, or generating install tokens. Endpoints return 403 if no active plan.

---

## Backend (`vericlick-backend/`)

### Stack
- **Python 3.13**, Django 6.0.2, DRF 3.16.1
- `djangorestframework-simplejwt` for JWT auth
- `django-cors-headers`, `django-filter`, `python-decouple`, `dnspython`, `tldextract`
- Dependencies in `requirements.txt`

### Models

| Model | Purpose |
|---|---|
| `Workspace` | Tenant container. Owner, plan, billing state. Plan lifecycle: active → suspended |
| `Plan` | Pricing tier. Code, name, price (one-time/week), domain_limit (1 for all plans) |
| `DomainRegistry` | Domain ownership with verification (`html_meta` or `dns_txt`), health status, purpose (`protection`, `redirect`, or `platform`) |
| `InstallToken` | SHA-256 hashed, `vc_` prefix, shown once on create |
| `ShieldConfig` | Per-workspace protection mode (strict/balanced/monitor), bot action (block/honeypot/log), path rules, rate limit |
| `RedirectRoute` | FK to DomainRegistry. Slug, destination, bot_action, 7-day expiry, `use_shortlink` boolean |
| `RedirectEvent` | Click analytics from edge proxy batch-push |
| `EdgeSyncCredential` | SHA-256 hashed `ek_` keys, max 2 per workspace |
| `IPRule` | Allow/deny IP rules (single IP or CIDR) |
| `CountryRule` | Country-level allow/deny |
| `DevicePolicy` | Device class allow-list, OS family block-list |
| `TrackerEvent` | Individual visit log with full bot detection signals |

### Key API Endpoints

#### Public (AllowAny)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health/` | Health check |
| `POST` | `/api/shield/verify/` | Core verification — accepts `api_key` or `install_token`, returns verdict. PoW enforcement in strict mode |
| `GET` | `/api/shield/config/` | Anti-bot config for script |
| `POST` | `/api/shield/telemetry/` | Batch telemetry from script |
| `GET` | `/api/pow/challenge/` | PoW challenge generation |
| `POST` | `/api/pow/verify/` | PoW solution verification, sets `_vc_pow` cookie |

#### Edge Proxy (AllowAny, authenticated via `X-Edge-Api-Key`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/edge/sync/` | Routes with per-workspace rules embedded (IP/country/device), includes `use_shortlink` |
| `GET` | `/api/edge/validate-domain/` | Caddy on-demand TLS check — 200 if domain active or `vericlick.cc` |
| `POST` | `/api/edge/verdict/` | Bot classification for edge redirect traffic (PoW + behavioral score enforced) |
| `POST` | `/api/edge/events/` | Batch push click events |

#### Auth-required (workspace-scoped)
| Method | Endpoint | Description |
|---|---|---|
| CRUD | `/api/redirect-routes/` | List/create redirect routes. `use_shortlink=true` skips domain_id, auto-creates vericlick.cc platform entry |
| `GET`/`PATCH`/`DELETE` | `/api/redirect-routes/{id}/` | Get/update/delete route |
| `POST` | `/api/redirect-routes/{id}/renew/` | Renew route |
| CRUD | `/api/domains/` | Domain registry (**403 if no plan**) |
| `GET`/`POST` | `/api/redirect-domains/` | List/add redirect-purpose domains (**403 if no plan**) |
| `POST` | `/api/redirect-domains/{id}/verify-cname/` | Check CNAME points to `edge.vericlick.cc` |

### 5-Layer Bot Detection
1. **Canvas fingerprint** — detect headless browsers with missing/abnormal canvas
2. **Mouse trajectory** — analyze movement patterns for bot signatures (speed variance, curvature entropy, teleports)
3. **TLS/JA4 fingerprinting** — JA3/JA4 hashes detect automated HTTP clients
4. **Proof-of-work** — computational challenge verifies real browser (SubtleCrypto SHA-256, enforced in strict mode)
5. **Behavioral scoring** — composite score (0.0 bot → 1.0 human) with 16 weighted signals including headless detection

### Bot Detection Signals (score_from_signals)
- JA4-UA consistency, TLS browser detection, client hints, Sec-Fetch headers
- Canvas hash stability, canvas presence
- Mouse trajectory: straightness, speed variance, curvature entropy
- Click timing variance, click center offset
- Teleport count, mouse event count, event trust (isTrusted flag)
- Headless browser detection: navigator.webdriver, chrome object, plugin count, notification permission
- PoW solve status and timing

### Antibot Enforcement
- **Strict mode**: PoW required (checks `_vc_pow` cookie), blocks bots scoring < 0.35
- **Balanced mode**: Challenges suspicious visitors, lets them through
- **Monitor mode**: Logs only, never blocks
- **Edge verdict**: Same enforcement pipeline, checks PoW + behavioral score
- **Rate limiting**: Per-IP per-hour from both TrackerEvent and RedirectEvent tables
- **Auto-reputation**: 4 flags in 15 minutes → auto-deny for 24 hours (counts both tables)
- **Verdict cache**: 15 seconds (fast re-evaluation)

### Shortlink Feature
- `vericlick.cc/SLUG` shortlinks available to all users — no DNS setup needed
- `RedirectRoute.use_shortlink` boolean, auto-creates `vericlick.cc` platform domain entry
- Edge proxy resolves via `shortlink:{slug}` Redis key (secondary index alongside `routes:{domain}:{slug}`)
- Frontend wizard: 2-step flow for shortlinks (type → destination), 4-step for custom domains

### Plan Enforcement
- `domain_list_create` → 403 if no active plan
- `redirect_domain_list_create` → 403 if no active plan
- `install_token_list_create` → 403 if no active plan
- Redirect routes require a verified domain (which requires a plan)

### Plan Lifecycle
- `active` → paid period in force (full access)
- `suspended` → the paid period ended; protection inactive and links stop until renewal

### Background Tasks
- `check_redirect_expiry` — daily cron, sends warning emails 1 day before + day of redirect expiry, auto-deactivates expired routes

### Error Format
All errors: `{"errors": [{"field": ..., "detail": ...}]}`

### Security
- Throttling: anonymous 100/hr, authenticated 1000/hr, tracker 600/min
- Production: HSTS 1yr, SSL redirect, secure cookies, nosniff
- `SECURE_PROXY_SSL_HEADER` only when `TRUST_X_FORWARDED_PROTO=true`
- Install tokens: SHA-256 hashed, raw shown once, `vc_` prefix
- Edge credentials: SHA-256 hashed, `ek_` prefix, max 2 per workspace
- PoW HMAC: signed challenge/verify, clearance tokens are HMAC-signed with IP binding

### Testing
- ~273 tests in `vericlick/tests.py`
- Dev: `python manage.py test` (SQLite)
- CI: `python manage.py test --settings=Vericlick_project.settings_test`

### Migrations
- `0036` — EdgeSyncCredential workspace nullable
- `0037` — Shortlink feature (use_shortlink field, PLATFORM purpose)
- `0038` — RedirectRoute domain OneToOne → FK

---

## Frontend (`vericlick-frontend/`)

### Stack
- **React 19**, Vite 8 (rolldown), TypeScript, Tailwind CSS 4
- `@tanstack/react-query` v5, `axios`, `react-router-dom` v7, `react-hot-toast`
- `react-hook-form` + `zod`, `recharts`, `@hugeicons/core-free-icons`

### Key Pages
| Path | Page |
|---|---|
| `/app/dashboard` | Stats, traffic chart, activity feed. Empty state: 3-step onboarding |
| `/app/install` | Domain selector, platform selector, combined snippet (meta tag + script), install token management |
| `/app/domains` | Domain management with verification modal, health badges |
| `/app/redirects` | Redirect routes + **shortlink creation wizard** (2-step for shortlinks, 4-step for custom domains) |
| `/app/shield` | Anti-Bot Configuration — protection mode, bot action, rate limit, path rules |
| `/app/traffic-rules` | IP allow/deny rules, country rules, device/OS policies |
| `/app/blocked-ips` | Blocked traffic review queue |
| `/app/billing` | Plan management, payment history. One-time 7-day access, crypto only |
| `/app/settings` | Workspace settings |

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
- **Security hardening**: blocks direct IP access (HTTP 444), strips `Server` and `X-Powered-By` headers

### Flow
1. Caddy receives HTTPS request on port 443
2. On-demand TLS: Caddy calls `/api/edge/validate-domain/` to check if domain should get a cert
3. Direct IP access → HTTP 444 (connection closed)
4. Request passes through FastAPI app (headers stripped)
5. Route lookup: `routes:{domain}:{slug}` first, then `shortlink:{slug}` for vericlick.cc
6. Per-workspace rule enforcement (IP allow/deny, country allow/deny, device/OS policy)
7. Backend verdict via `/api/edge/verdict/` (PoW + behavioral score enforced)
8. Human traffic → 302 redirect to destination
9. Bot traffic → honeypot/block/neutral/redirect based on route config
10. Events batched and pushed to `/api/edge/events/` every 60 seconds

### Shortlink Resolution
- Sync writes `shortlink:{slug}` keys for routes with `use_shortlink=true`
- When host+slug lookup fails, edge tries `shortlink:{slug}` (slug-only lookup)
- Normalizes host to `vericlick.cc` for event tracking

### Per-Workspace Rules (embedded in route sync)
- IP allow/deny lists (CIDR-aware)
- Country allow/deny rules
- Device class allow-list, OS family block-list
- Lightweight UA parser (keyword matching, no library dependency)

### Security
- `StripServerHeadersMiddleware` removes `Server` and `X-Powered-By` from all responses
- Caddyfile: `header -Server -X-Powered-By` on both default and on-demand TLS blocks
- Direct IP access returns 444 (no content served)
- Verdict cache TTL: 15 seconds (fast re-evaluation for blocked visitors)

---

## Domain Architecture

### Three domain purpose types

| Type | Purpose | Public-facing |
|---|---|---|
| `protection` | Customer's own site protected by anti-bot script | Customer's domain |
| `redirect` | Customer's domain for smart redirects via edge proxy | CNAMEs to `edge.vericlick.cc` |
| `platform` | VeriClick-owned shortlink domain (`vericlick.cc`) | `vericlick.cc` |

### Security rule
`vericlick.site` never appears in any public redirect path, HTTP header, DNS record, or SSL certificate.

### Verification methods
- **HTML meta tag** (primary): `<meta name="vericlick-verification" content="<token>">`
- **DNS TXT record** (fallback): `_vericlick-challenge.<domain>` → `vericlick-verify=<token>`
- **CNAME check** (redirect domains): verify domain CNAMEs to `edge.vericlick.cc`
- **Platform domains** (shortlinks): pre-verified, no customer DNS needed

### Combined snippet
The Install page provides a single copy-paste block that includes both the verification meta tag and the anti-bot script:
```html
<!-- VeriClick — domain verification + anti-bot protection -->
<meta name="vericlick-verification" content="<token>">
<script src="https://vericlick.site/api/shield.js" data-token="<install_token>" defer></script>
```

---

## Deployment

### Main VPS (`vericlick.site` — `162.35.96.19`)
```bash
ssh root@162.35.96.19
cd ~/VeriClick
git pull
bash deploy/deploy.sh update
```

### Edge Proxy (`vericlick.cc` — FlokiNET)
```bash
ssh root@<flokinett-ip>
cd ~/VeriClick
git pull
cd edge-proxy && docker compose down && docker compose up -d --build
```

### DNS Setup
1. `vericlick.site` → A record → `162.35.96.19` (InterServer)
2. `vericlick.cc` → A record → FlokiNET IP
3. `edge.vericlick.cc` → A record → FlokiNET IP (CNAME target for customer domains)
4. Customer redirect domains → CNAME → `edge.vericlick.cc`

### SSL
- `vericlick.site`: Cloudflare Origin CA + Full (strict) mode
- `vericlick.cc` / `edge.vericlick.cc`: Let's Encrypt via Caddy
- Customer domains: On-demand TLS via Caddy (validated against backend)
