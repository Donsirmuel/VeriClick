# VeriClick — Project Handoff

## Overview

VeriClick is a link protection & traffic routing platform. It detects and blocks bot traffic in real time, monitors domain health (RBL/blacklist checks), and provides analytics via a dashboard. Delivery is hybrid: **tracking links** (`/r/<slug>`) plus an **optional site script** (`/api/tracker.js`) that sends browser signals back to the API for extra detection. IP traffic is managed via allow/deny **IP rules** with a dedicated blocked-traffic review queue.

Blocked/challenged clicks are **diverted safely**: the redirect 302s to the workspace's configured `safe_destination` (a neutral page you control), falling back to the built-in `/suspicious/` neutral page — never to the real destination. Traffic is enriched with GeoIP location (country/region/city) where available, surfaced in the dashboard activity feed and blocked-IP review queue.

The frontend is a React 19 + Vite + TypeScript SPA; the backend is a Django 6.0 + DRF REST API. All JSON is camelCase on the wire (snake_case in Django).

---

## Backend (`vericlick-backend/`)

### Stack
- **Python 3.13**, Django 6.0.2, Django REST Framework 3.16.1
- `djangorestframework-simplejwt` for JWT auth
- `django-cors-headers`, `django-filter`, `python-decouple`, `dnspython` (DNS TXT verification)
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
│   ├── serializers.py       # camelCase JSON serializers (+ tracking_url, tracker_secret, safe_destination, verified, reasonLabel, verificationRecord)
│   ├── views.py             # all API views + TrackerEventThrottle; redirect diverts blocked to safe destination
│   ├── urls.py              # API routes (router + function views)
│   ├── services.py          # classify_request (allow-first), lookup_location (GeoIP2 or offline), get_safe_destination, verify_domain_ownership (dnspython), reason_label
│   ├── static/tracker.js    # site-script template (IIFE; reads data-site + data-token)
│   ├── management/commands/check_domains.py   # domain health scanner (--interval / --once); does NOT set verified
│   ├── migrations/          # 0001..0007 (0007: DomainRegistry.verification_token + verified help_text)
│   ├── utils.py             # CamelCaseJSON renderer/parser, custom exception handler
│   ├── tests.py             # 155 tests (all test classes in this one file)
│   └── version.py           # get_version() helper
├── manage.py
└── db.sqlite3
```

### Models

| Model | Key Fields | Notes |
|---|---|---|
| `Workspace` | `id` (UUID), `name`, `owner` (FK→User), `tracker_secret` (UUID, read-only), `safe_destination` (URL, blank), `created_at`, `last_domain_scan_at` | Auto-created via `post_save` signal on `User`; `tracker_secret` gates tracker events; `safe_destination` is the neutral fallback for diverted blocked clicks |
| `DomainRegistry` | `id` (UUID), `workspace` (FK), `domain` (unique), `health_status`, `last_checked`, `verified` (bool), `verification_token` (UUID, read-only) | Statuses: `healthy`, `degraded`, `blacklisted`; `verified` is set ONLY by the DNS TXT ownership action (`POST /api/domains/{id}/verify/`), NOT by the health scan — a domain can resolve fine (healthy) but be unverified; `verification_record` property = `vericlick-verify=<token>` TXT value |
| `TrackingLink` | `id` (UUID), `workspace` (FK), `domain` (FK→DomainRegistry, nullable), `slug` (unique), `destination_url`, `status`, `total_clicks`, `bot_clicks` | Statuses: `active`, `paused`, `disabled`; serializer exposes `trackingUrl` |
| `ClickLog` | `id` (UUID), `link` (FK), `ip`, `country`, `region`, `city`, `device`, `user_agent`, `is_bot`, `reason`, `decision`, `matched_rule` | `decision`/`matched_rule` record why a click was allowed/blocked; `region`/`city` from GeoIP enrichment; serializer exposes plain-language `reasonLabel` via `services.reason_label()` |
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
| `CRUD` | `/api/domains/` | Registered domains (serializer exposes `verificationToken` + `verificationRecord` read-only) |
| `POST` | `/api/domains/{id}/recheck/` | Trigger domain health recheck |
| `POST` | `/api/domains/{id}/verify/` | Verify domain ownership — performs a live DNS TXT lookup for `vericlick-verify=<token>` (dnspython) and flips `verified=true` on match; 400 if the record isn't published yet |
| `CRUD` | `/api/ip-rules/` | IP rules (allow/deny, optional `expiresAt`) |
| `POST` | `/api/ip-rules/{click_id}/whitelist/` | Whitelist a blocked click's IP (creates/reactivates an ALLOW rule) |
| `GET` | `/api/ip-rules/blocked/` | Blocked-traffic review queue (recent blocked clicks, `BlockedIPSerializer`) |

### Security & Error Handling
- All errors normalized to `{"errors": [{"field": ..., "detail": ...}]}` via `vericlick.utils.custom_exception_handler`
- Throttling: anonymous 100 req/hr, authenticated 1000 req/hr, tracker events 600/min (scope `tracker`)
- Production security headers when `DEBUG=False`: HSTS (1 year), SSL redirect, secure cookies, nosniff
- CORS locked to configured origins (no origins allowed by default — set `CORS_ALLOWED_ORIGINS` in `.env`)
- Tracker events are **token-gated**: payload must include the workspace's `tracker_secret` or the API returns 400
- Bot detection: **allow-first** flow in `services.classify_request` — allow IP rule wins (highest priority), then deny IP rule, then UA heuristics, then rate limit, else default allow. `lookup_location(ip)` enriches country/region/city via optional GeoIP2 (set `GEOIP2_DB` in settings; otherwise offline fallback: Localhost / Private network / Reserved / Unknown)
- Safe diversion: `get_safe_destination(workspace, request)` returns the configured `safe_destination`, else the built-in `/suspicious/` neutral page; blocked/challenged clicks are 302-diverted (never a 403, never the real destination)

### Domain health scheduler & ownership verification
- **In-app refresh is the default (no scheduler required):** `services.refresh_stale_domains(workspace, max_age_minutes=15, limit=10)` re-checks any domain whose last scan is older than 15 minutes (or that has never been scanned) and bumps `workspace.last_domain_scan_at`. It is invoked on `GET /api/dashboard/stats/` and `GET /api/domains/`, so health stays current as users open the app — no external cron/systemd job is required.
- `python manage.py check_domains --once` — run a single scan (updates `last_checked` + `last_domain_scan_at`); **does not** set `verified`
- `python manage.py check_domains --interval 900` — loop every 900s (rejects negative intervals); optional proactive scanning under a process manager in production
- **Ownership verification is separate and on-demand**: the frontend calls `POST /api/domains/{id}/verify/`, which resolves the domain's TXT records and matches against `verification_token`. Until the owner publishes `vericlick-verify=<token>`, the domain shows as healthy-but-unverified in the UI.
- Command tests live in `DomainScanCommandTests`; ownership verification tests in `DomainVerificationTests`; in-app refresh tests in `InAppDomainRefreshTests`; reason-label tests in `ReasonLabelTests`

### Plain-language reason labels
- `services.reason_label(decision, reason, matched_rule)` maps raw decision/reason codes to human-readable strings, e.g. `Tor Exit Node` → "Blocked by automated detection", `IPRule: deny` → "Blocked by a deny rule you created", `Rate limit` → "Blocked — too many requests from this address", allowed clicks → "Human traffic — let through"
- Exposed as `reasonLabel` on `ClickLogSerializer` and `BlockedIPSerializer`; surfaced in the dashboard activity feed and blocked-IP queue

### Production settings hardening
- `DEBUG=False` now **refuses to boot** (`ImproperlyConfigured`) without explicit `SECRET_KEY` and `ALLOWED_HOSTS` — fail-closed for production; `DEBUG=True` uses safe localhost defaults
- `SECURE_REFERRER_POLICY` set; `SECURE_PROXY_SSL_HEADER` only enabled when `TRUST_X_FORWARDED_PROTO=true`; `CSRF_TRUSTED_ORIGINS` from env
- Template: `Vericlick_project/Vericlick_project/.env.example`

### Testing
- 175 tests in `vericlick/tests.py`
- Dev: `python manage.py test` (SQLite)
- CI equivalent: `python manage.py test --settings=Vericlick_project.settings_test`
- Covers: model tests, serializer camelCase, all endpoints (CRUD, auth, edge cases), redirect classification + safe diversion, neutral page, GeoIP lookup, allow-first precedence, SEO/robots, domain scan command, DNS TXT ownership verification (mocked dnspython), reason labels, tracker script + token-gated events, blocked-IP whitelist, workspace detail/PATCH
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
│   ├── auth.ts          # login, register, refreshToken, forgotPassword, resetPassword, fetchMe, googleLogin
│   ├── links.ts         # fetchLinks, createLink, updateLink, deleteLink
│   ├── domains.ts       # fetchDomains, createDomain, updateDomain, deleteDomain, recheckDomain, verifyDomain
│   ├── ip_rules.ts      # fetchIpRules, createIpRule, deleteIpRule, whitelistIp, fetchBlockedIps
│   ├── workspace.ts     # fetchWorkspace, updateWorkspace({name, safeDestination}) (returns trackerSecret)
│   └── dashboard.ts     # fetchDashboardStats, fetchTrafficData, fetchActivity
├── components/
│   ├── auth/GoogleSignInButton.tsx
│   ├── layout/{DashboardLayout,Sidebar,TopBar}.tsx
│   ├── dashboard/{StatCard,TrafficChart,ActivityFeed,DomainHealthWidget,BlockedQueueWidget}.tsx   # ActivityFeed: human/bot labels + region/city + reasonLabel; DomainHealthWidget: lastScan time (15-min cadence); BlockedQueueWidget: recent blocked + "View Blocked IPs" link
│   ├── links/CreateLinkModal.tsx      # react-hook-form + zod, active/paused status
│   ├── domains/{AddDomainDialog,VerifyDomainDialog}.tsx   # VerifyDomainDialog: copy TXT record, check-verification, success state
│   ├── ui/{ConfirmDialog,EmptyState,HelpTooltip}.tsx
│   ├── SEOHead.tsx                    # robots noindex for /auth + /app
│   ├── ErrorBoundary.tsx
│   └── Logo.tsx
├── lib/  (errors.ts, queryClient.ts, utils.ts, site.ts, chat.ts)
├── components/chat/ChatWidget.tsx     # floating FAQ assistant (rule-based, answers from lib/chat.ts; links out to contact email)
├── components/{PublicNav,PublicFooter}.tsx  # shared marketing nav/footer used by Landing/Pricing/privacy/terms
├── pages/
│   ├── Dashboard.tsx       # 5-step onboarding checklist (incl. "Verify your domain" → DNS TXT flow); stats/chart/feed/health + blocked-queue widgets
│   ├── Links.tsx           # tracked-link table: copy tracked URL, preview destination, create/edit/delete
│   ├── Domains.tsx         # CRUD + recheck + DNS TXT "Verify ownership" (opens VerifyDomainDialog) + "Verified" badge
│   ├── IpRules.tsx         # allow/deny rules with expiration + remaining-time + "expire now"; help copy states allow-rule-checked-first precedence
│   ├── BlockedIPs.tsx      # blocked-traffic queue: IP + location (region/city), plain-language "Why it was blocked", Bot/Human label, whitelist action (allow-first copy)
│   ├── Settings.tsx        # rename workspace + safe destination field + Site Script tab (copy-ready <script> with data-site + data-token); Security items show "coming soon" toasts
│   └── auth pages + Landing + Pricing + PrivacyPolicy + TermsOfService + NotFound
├── types/index.ts          # TrackingLink, Domain (verified + verificationToken + verificationRecord), DashboardStats, IPRule, BlockedIP (region/city + reasonLabel), ActivityEntry (reasonLabel), Workspace (safeDestination), TimeRange
├── App.tsx                 # routes; all pages React.lazy code-split with Suspense fallback
└── main.tsx
```

### Routing
| Path | Page | Notes |
|---|---|---|
| `/` | Landing | Public |
| `/pricing`, `/privacy`, `/terms` | Pricing / Privacy Policy / Terms of Service | Public |
| `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` | Auth pages | Public |
| `/app/dashboard` | Dashboard | Protected; guided 5-step onboarding checklist until first link/verified domain/click exist |
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

### API client
- The frontend always calls the real backend — there is no mock layer. `api/mock.ts`, `MOCK_MODE`, and `VITE_MOCK_MODE` were removed for the production cut.
- Frontend API client camelCases responses, so backend `tracker_secret` → `trackerSecret`, `tracking_url` → `trackingUrl`, etc.

### SEO (env-driven)
- `vite.config.ts` ships an inline `seoFiles()` plugin: on `npm run build` it writes `dist/robots.txt` + `dist/sitemap.xml` from `VITE_SITE_URL` (default `https://vericlick.io`). No static copies live in `public/` anymore — set `VITE_SITE_URL` to the deployed domain before building.
- `index.html` carries title/description/OG/Twitter/JSON-LD metadata (canonical domain: vericlick.io).

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
Note: `.env` lives at `Vericlick_project/Vericlick_project/.env` (settings find it via decouple). Production is fail-closed: `DEBUG=False` by default and the app refuses to boot without explicit `SECRET_KEY` and `ALLOWED_HOSTS`. See `.env.example` for the full set of production keys.

### Frontend
```bash
cd vericlick-frontend
npm install
npm run dev
```
Environment variables (`.env`, see `.env.example`): `VITE_API_BASE_URL=https://getvericlick.site/api`, `VITE_SITE_URL` (drives build-time `robots.txt`/`sitemap.xml`), `VITE_GOOGLE_CLIENT_ID`.

### Google OAuth Setup
1. Google Cloud Console → Credentials → OAuth 2.0 Client ID (Web application)
2. Add `https://getvericlick.site` and `https://www.getvericlick.site` to Authorized JavaScript origins
3. Set `GOOGLE_CLIENT_ID` in backend `.env` and `VITE_GOOGLE_CLIENT_ID` in frontend `.env`

### Production Checklist
- [ ] Set `DEBUG=False`, strong `SECRET_KEY`, production `ALLOWED_HOSTS` + `CORS_ALLOWED_ORIGINS` (app refuses to boot with `DEBUG=False` unless both are set)
- [ ] Run `python manage.py migrate` (includes `0007` DomainRegistry.verification_token) and `collectstatic`
- [ ] Domain health stays current via the in-app stale-refresh (dashboard + domain list); the scheduled `check_domains` loop is optional — see `deploy/systemd/vericlick-domain-check.{service,timer}` and `deploy/cron.example`
- [ ] Verify domain ownership per domain via the UI (`POST /api/domains/{id}/verify/`); the health scan no longer flips `verified`
- [ ] Configure a `safe_destination` per workspace (Settings) so blocked traffic diverts to a neutral page you control; `/suspicious/` is the built-in fallback
- [ ] Configure real email backend for password reset
- [ ] Add a real GeoIP database and set `GEOIP2_DB` in settings to enrich country/region/city (offline fallback currently returns Localhost/Private network/Reserved/Unknown)
- [ ] PostgreSQL recommended over SQLite
- [ ] Build the frontend with `VITE_SITE_URL=https://yourdomain` so `robots.txt`/`sitemap.xml` reference the deployed domain (`og-image.png` already ships in `public/`)
- [ ] Install script embed is token-gated (`data-token`) — do not leak the token in public HTML; served from `VITE_API_BASE_URL` origin (`/api/tracker.js`)
