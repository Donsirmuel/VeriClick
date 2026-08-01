# VeriClick — Project Handoff

## Overview

VeriClick is a link protection & traffic routing platform. It detects and blocks bot traffic in real time, monitors domain health (RBL/blacklist checks), and provides analytics via a dashboard. Delivery is hybrid: **tracking links** (`/r/<slug>`) plus an **optional site script** (`/api/tracker.js`) that sends browser signals back to the API for extra detection. IP traffic is managed via allow/deny **IP rules** with a dedicated blocked-traffic review queue.

Blocked/challenged clicks are **diverted safely**: the redirect 302s to the workspace's configured `safe_destination` (a neutral page you control), falling back to the built-in `/suspicious/` neutral page — never to the real destination. Traffic is enriched with GeoIP location (country/region/city) where available, surfaced in the dashboard activity feed and blocked-IP review queue.

The frontend is a React 19 + Vite + TypeScript SPA; the backend is a Django 6.0 + DRF REST API. All JSON is camelCase on the wire (snake_case in Django).

---

## Backend (`vericlick-backend/`)

### Stack
- **Python 3.13**, Django 6.0.7, Django REST Framework 3.17.1
- `djangorestframework-simplejwt` for JWT auth
- `django-cors-headers`, `django-filter`, `python-decouple`
- Dependencies pinned in `requirements.txt` (used by CI)

### Project structure
```
Vericlick_project/
├── Vericlick_project/
│   ├── settings.py          # env-driven config, SimpleJWT, CORS, throttling, TRACKER_SCRIPT_PATH, optional GEOIP2_DB
│   ├── settings_test.py     # CI/test settings: forced SECRET_KEY, DEBUG=True, SSL redirects off, in-memory SQLite
│   └── urls.py              # root URL config (includes vericlick.urls; hosts /suspicious/ neutral page)
├── vericlick/
│   ├── models.py            # Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, TrackerEvent
│   ├── serializers.py       # camelCase JSON serializers (+ tracking_url, tracker_secret, safe_destination, verified)
│   ├── views.py             # all API views + TrackerEventThrottle; redirect diverts blocked to safe destination
│   ├── urls.py              # API routes (router + function views)
│   ├── services.py          # classify_request (allow-first), lookup_location (GeoIP2 or offline), get_safe_destination
│   ├── static/tracker.js    # site-script template (IIFE; reads data-site + data-token)
│   ├── management/commands/check_domains.py   # domain health scanner (--interval / --once); sets verified on success
│   ├── migrations/          # 0001..0006 (0006: ClickLog.city/region, DomainRegistry.verified, Workspace.safe_destination)
│   ├── utils.py             # CamelCaseJSON renderer/parser, custom exception handler
│   ├── tests.py             # 135 tests (all test classes in this one file)
│   └── version.py           # get_version() helper
├── manage.py
└── db.sqlite3
```

### Models

| Model | Key Fields | Notes |
|---|---|---|
| `Workspace` | `id` (UUID), `name`, `owner` (FK→User), `tracker_secret` (UUID, read-only), `safe_destination` (URL, blank), `created_at`, `last_domain_scan_at` | Auto-created via `post_save` signal on `User`; `tracker_secret` gates tracker events; `safe_destination` is the neutral fallback for diverted blocked clicks |
| `DomainRegistry` | `id` (UUID), `workspace` (FK), `domain` (unique), `health_status`, `last_checked`, `verified` (bool) | Statuses: `healthy`, `degraded`, `blacklisted`; `verified` set by `check_domains` on successful scan |
| `TrackingLink` | `id` (UUID), `workspace` (FK), `domain` (FK→DomainRegistry, nullable), `slug` (unique), `destination_url`, `status`, `total_clicks`, `bot_clicks` | Statuses: `active`, `paused`, `disabled`; serializer exposes `trackingUrl` |
| `ClickLog` | `id` (UUID), `link` (FK), `ip`, `country`, `region`, `city`, `device`, `user_agent`, `is_bot`, `reason`, `decision`, `matched_rule` | `decision`/`matched_rule` record why a click was allowed/blocked; `region`/`city` from GeoIP enrichment |
| `IPRule` | `id` (UUID), `workspace` (FK), `ip_or_cidr`, `action` (allow/deny), `reason`, `expires_at`, `is_active`, `created_by` | Allow/deny lists; supports single IP or CIDR |
| `TrackerEvent` | `id` (UUID), `workspace` (FK), `page_url`, `referrer`, `signals` (JSON), `engagement` (JSON), `created_at` | Browser signal data from the site script |

All models use UUID primary keys and are scoped to a `Workspace` for data isolation.

### API Endpoints

#### Public / AllowAny
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health/` | Health check |
| `GET` | `/api/r/<slug>/` | Public redirect — classifies visitor (IP rules → bot UA → rate limit), logs click; humans 302 to destination, blocked/challenged 302-divert to workspace `safe_destination` or `/suspicious/` |
| `GET` | `/suspicious/` | Built-in neutral page (root-level, public) — fallback when no `safe_destination` is configured |
| `GET` | `/api/tracker.js` | Serves the site-script (JS content type, `Cache-Control: public, max-age=3600`), untrottled |
| `POST` | `/api/tracker/event/` | Ingest tracker event — requires valid `site_id` + `token` (workspace `tracker_secret`); throttled `tracker: 600/min` |
| `POST` | `/api/auth/register/` | Create user (username, email, password) |
| `POST` | `/api/auth/login/` | JWT login → `{access, refresh}` |
| `POST` | `/api/auth/refresh/` | Refresh JWT token |
| `POST` | `/api/auth/google/` | Google OAuth sign-in/sign-up — accepts `{id_token}`, verifies via tokeninfo, creates user if new, returns `{access, refresh}` |
| `POST` | `/api/auth/password-reset/` | Request password reset — returns `{token, uid}` (dev mode, no email) |
| `POST` | `/api/auth/password-reset/confirm/` | Confirm password reset (uid, token, password) |

#### Auth-required (workspace-scoped)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/me/` | Current user |
| `GET`/`PATCH` | `/api/workspace/` | Workspace detail (name + `safeDestination`) — also returns read-only `trackerSecret` + `lastDomainScanAt` |
| `GET` | `/api/dashboard/stats/` | 24h click stats, bot %, active links, domain health counts |
| `GET` | `/api/dashboard/traffic/?range=7d` | Daily aggregated traffic (human/bot); ranges `7d`, `30d`, `90d` |
| `GET` | `/api/dashboard/activity/` | Last 50 clicks with metadata |
| `CRUD` | `/api/links/` | Tracking links (paginated, searchable); serializer returns `trackingUrl` (custom domain → `https://<domain>/<slug>`, else `/r/<slug>`) |
| `CRUD` | `/api/domains/` | Registered domains |
| `POST` | `/api/domains/{id}/recheck/` | Trigger domain health recheck |
| `CRUD` | `/api/ip-rules/` | IP rules (allow/deny, optional `expiresAt`) |
| `POST` | `/api/ip-rules/{click_id}/whitelist/` | Whitelist a blocked click's IP (creates/reactivates an ALLOW rule) |
| `GET` | `/api/ip-rules/blocked/` | Blocked-traffic review queue (recent blocked clicks, `BlockedIPSerializer`) |

### Security & Error Handling
- All errors normalized to `{"errors": [{"field": ..., "detail": ...}]}` via `vericlick.utils.custom_exception_handler`
- Throttling: anonymous 100 req/hr, authenticated 1000 req/hr, tracker events 600/min (scope `tracker`)
- Production security headers when `DEBUG=False`: HSTS (1 year), SSL redirect, secure cookies, nosniff
- CORS locked to configured origins (default: `localhost:5173,localhost:4173`)
- Tracker events are **token-gated**: payload must include the workspace's `tracker_secret` or the API returns 400
- Bot detection: **allow-first** flow in `services.classify_request` — allow IP rule wins (highest priority), then deny IP rule, then UA heuristics, then rate limit, else default allow. `lookup_location(ip)` enriches country/region/city via optional GeoIP2 (set `GEOIP2_DB` in settings; otherwise offline fallback: Localhost / Private network / Reserved / Unknown)
- Safe diversion: `get_safe_destination(workspace, request)` returns the configured `safe_destination`, else the built-in `/suspicious/` neutral page; blocked/challenged clicks are 302-diverted (never a 403, never the real destination)

### Domain health scheduler
- `python manage.py check_domains --once` — run a single scan (updates `last_checked` + `last_domain_scan_at`); successful scans set the domain's `verified` flag
- `python manage.py check_domains --interval 900` — loop every 900s (rejects negative intervals); intended to run under a process manager in production
- Command tests live in `DomainScanCommandTests`

### Testing
- 135 tests in `vericlick/tests.py`
- Dev: `python manage.py test` (SQLite)
- CI equivalent: `python manage.py test --settings=Vericlick_project.settings_test`
- Covers: model tests, serializer camelCase, all endpoints (CRUD, auth, edge cases), redirect classification + safe diversion, neutral page, GeoIP lookup, allow-first precedence, SEO/robots, domain scan command, tracker script + token-gated events, blocked-IP whitelist, workspace detail/PATCH
- **CI** (`.github/workflows/ci.yml`): backend on Python 3.12 (`pip install -r requirements.txt`, run tests with `settings_test`); frontend on Node 22 (`npm ci`, `npm run build`, `npm run lint`)

---

## Frontend (`vericlick-frontend/`)

### Stack
- **React 19**, Vite 8 (rolldown), TypeScript, Tailwind CSS 4
- `@tanstack/react-query` v5, `axios`, `react-router-dom` v7, `react-hot-toast`
- `react-hook-form` + `zod` (forms), `recharts` (charts), `@hugeicons/react` + `@hugeicons/core-free-icons` (icons)
- Lint: `oxlint`; scripts: `dev`, `build` (`tsc -b && vite build`), `lint`, `preview`

### Project structure (key files)
```
src/
├── api/
│   ├── client.ts        # axios instance, token refresh interceptor, 401/429 handling
│   ├── mock.ts          # mock data helper (stats incl. lastDomainScan; activity/blocked entries incl. region/city)
│   ├── auth.ts          # login, register, refreshToken, forgotPassword, resetPassword, fetchMe, googleLogin
│   ├── links.ts         # fetchLinks, createLink, updateLink, deleteLink
│   ├── domains.ts       # fetchDomains, createDomain, updateDomain, deleteDomain, recheckDomain
│   ├── ip_rules.ts      # fetchIpRules, createIpRule, deleteIpRule, whitelistIp, fetchBlockedIps
│   ├── workspace.ts     # fetchWorkspace, updateWorkspace({name, safeDestination}) (returns trackerSecret)
│   └── dashboard.ts     # fetchDashboardStats, fetchTrafficData, fetchActivity
├── components/
│   ├── auth/GoogleSignInButton.tsx
│   ├── layout/{DashboardLayout,Sidebar,TopBar}.tsx
│   ├── dashboard/{StatCard,TrafficChart,ActivityFeed,DomainHealthWidget}.tsx   # ActivityFeed: human/bot labels + region/city; DomainHealthWidget: lastScan time (15-min cadence)
│   ├── links/CreateLinkModal.tsx      # react-hook-form + zod, active/paused status
│   ├── domains/AddDomainDialog.tsx
│   ├── ui/{ConfirmDialog,EmptyState,HelpTooltip}.tsx
│   ├── SEOHead.tsx                    # robots noindex for /auth + /app
│   ├── ErrorBoundary.tsx
│   └── Logo.tsx
├── lib/  (errors.ts, queryClient.ts, utils.ts)
├── pages/
│   ├── Dashboard.tsx       # 5-step onboarding checklist (incl. "Verify your domain"); stats/chart/feed/health widgets
│   ├── Links.tsx           # tracked-link table: copy tracked URL, preview destination, create/edit/delete
│   ├── Domains.tsx         # CRUD + recheck + "Verified" badge (from check_domains)
│   ├── IpRules.tsx         # allow/deny rules with expiration + remaining-time + "expire now"; help copy states allow-rule-checked-first precedence
│   ├── BlockedIPs.tsx      # blocked-traffic queue: IP + location (region/city), Bot/Human label, whitelist action (allow-first copy)
│   ├── Settings.tsx        # rename workspace + safe destination field + Site Script tab (copy-ready <script> with data-site + data-token)
│   └── auth pages + Landing + NotFound
├── types/index.ts          # TrackingLink, Domain (verified), DashboardStats, IPRule, BlockedIP (region/city), Workspace (safeDestination), TimeRange
├── App.tsx                 # routes; all pages React.lazy code-split with Suspense fallback
└── main.tsx
```

### Routing
| Path | Page | Notes |
|---|---|---|
| `/` | Landing | Public |
| `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` | Auth pages | Public |
| `/app/dashboard` | Dashboard | Protected; 5-step onboarding checklist until first link/verified domain/click exist |
| `/app/links` | Links | Protected |
| `/app/domains` | Domains | Protected |
| `/app/ip-rules` | IpRules | Protected |
| `/app/blocked-ips` | BlockedIPs | Protected |
| `/app/settings` | Settings | Protected |
| `*` | NotFound | |

All page modules are loaded via `React.lazy(() => import('./pages/...'))` with a Suspense fallback — the production build emits per-route chunks (no chunk > 500 kB warning).

### Auth Flow
1. JWT `access` + `refresh` stored in `localStorage`
2. `axios` interceptor adds `Bearer` header; on 401 it attempts refresh; on failure clears storage and redirects to login
3. `DashboardLayout` checks token on mount; `TopBar` fetches `/auth/me/`
4. Google OAuth via `GoogleSignInButton` (GIS when `VITE_GOOGLE_CLIENT_ID` set, otherwise a fallback button)

### Mock Mode
- `VITE_MOCK_MODE=false` (default in `.env`) uses the real API; any other value enables mock mode
- Frontend API client camelCases responses, so backend `tracker_secret` → `trackerSecret`, `tracking_url` → `trackingUrl`, etc.

### Code-splitting
- Done via `React.lazy` per route in `App.tsx` (`withSuspense` wrapper). The old single ~970 kB chunk note is obsolete — build output is now split into per-route chunks.

---

## Setup & Configuration

### Backend
```bash
cd vericlick-backend/Vericlick_project
cp Vericlick_project/.env.example Vericlick_project/.env  # or edit existing
../.vericlick-venv/Scripts/python.exe manage.py migrate
../.vericlick-venv/Scripts/python.exe manage.py runserver
```
Note: `.env` lives at `Vericlick_project/Vericlick_project/.env` (settings find it via decouple). `DEBUG=True`, `ALLOWED_HOSTS=*`, `DATABASE_URL=sqlite:///db.sqlite3`, `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173`.

### Frontend
```bash
cd vericlick-frontend
npm install
npm run dev
```
Environment variables (`.env`): `VITE_MOCK_MODE=false`, `VITE_API_BASE_URL=http://localhost:8000/api`, optional `VITE_GOOGLE_CLIENT_ID`. The Vite dev server proxies `/r/` to `http://localhost:8000`.

### Google OAuth Setup
1. Google Cloud Console → Credentials → OAuth 2.0 Client ID (Web application)
2. Add `http://localhost:5173` to Authorized JavaScript origins
3. Set `GOOGLE_CLIENT_ID` in backend `.env` and `VITE_GOOGLE_CLIENT_ID` in frontend `.env`

### Production Checklist
- [ ] Set `DEBUG=False`, strong `SECRET_KEY`, production `ALLOWED_HOSTS` + `CORS_ALLOWED_ORIGINS`
- [ ] Run `python manage.py migrate` and `collectstatic`
- [ ] Run `python manage.py check_domains --interval 900` under a process manager (systemd/cron/supervisor) — this also flips domain `verified` flags
- [ ] Configure a `safe_destination` per workspace (Settings) so blocked traffic diverts to a neutral page you control; `/suspicious/` is the built-in fallback
- [ ] Configure real email backend for password reset
- [ ] Add a real GeoIP database and set `GEOIP2_DB` in settings to enrich country/region/city (offline fallback currently returns Localhost/Private network/Reserved/Unknown)
- [ ] PostgreSQL recommended over SQLite
- [ ] Add `og-image.png` to `vericlick-frontend/public/`
- [ ] Install script embed is token-gated (`data-token`) — do not leak the token in public HTML; served from `VITE_API_BASE_URL` origin (`/api/tracker.js`)
