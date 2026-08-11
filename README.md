# VeriClick

Link protection for real traffic. VeriClick checks every click against your IP rules and bot detection before it reaches your page, and shows a plain-language reason for every decision.

## How it works

1. **Create a tracked link** — paste a destination URL, get a short `/r/<slug>` link (optionally on a domain you own).
2. **Every click is classified** — allow/deny IP rules first, then browser/UA heuristics, then rate limiting. Humans are 302-routed to the real destination; flagged traffic is diverted to your `safe_destination` (or VeriClick's built-in protected page) — never a 403, never the real page.
3. **Monitor** — dashboard stats, traffic chart, live activity feed, domain health, and a blocked-IP review queue. Each blocked entry explains *why* in plain language.

Domain health is checked automatically from inside the app (stale domains are
refreshed on demand when the dashboard or domain list is opened, plus an
optional scheduled `check_domains` command), and domain **ownership** is
verified separately via a DNS TXT record (`vericlick-verify=<token>`) — a
domain can be healthy without being verified, and the UI surfaces both states.

## Repository layout

```
vericlick-backend/    Django 6 + DRF REST API (JWT auth, redirect engine, tracker script)
vericlick-frontend/   React 19 + Vite + TypeScript SPA (dashboard, landing, CRUD)
deploy/               systemd unit/timer + cron examples for the domain checker
```

See `HANDOFF.md` for a deep technical handoff and `DEPLOYMENT.md` for the launch checklist.

## Backend (Django + DRF)

- Python 3.13, Django 6.0, DRF 3.16, SimpleJWT, dnspython
- All JSON is camelCase on the wire (snake_case in Django)
- 175 tests (`python manage.py test --settings=Vericlick_project.settings_test`)

```bash
cd vericlick-backend/Vericlick_project
cp Vericlick_project/.env.example Vericlick_project/.env
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Production config is fail-closed: with `DEBUG=False` the app refuses to boot without an explicit `SECRET_KEY` and `ALLOWED_HOSTS`. For deployment on a VPS, use the local PostgreSQL instance on that server rather than an external hosted database.

## Frontend (React + Vite)

```bash
cd vericlick-frontend
npm install
npm run dev
```

- `VITE_API_BASE_URL=https://getvericlick.site/api` — backend origin
- `VITE_SITE_URL` — deployed domain; used by `SEOHead.tsx` for per-page canonical URLs
- `VITE_GOOGLE_SITE_VERIFICATION` / `VITE_BING_VERIFICATION` — search-console verification codes (blank until indexing is set up)

`npm run build` runs `tsc -b && vite build` and emits per-route chunks; `npm run lint` runs oxlint. `robots.txt` / `sitemap.xml` are served by the Django backend (canonical from `SITE_URL`).

## Domain health scheduling

Domain health checks run automatically in-app: `refresh_stale_domains`
(`vericlick/services.py`) re-checks any domain whose last scan is older than
15 minutes when the dashboard or domain list is requested — no scheduler needed
for most deployments.

For proactive checks you can still run scans on a loop or timer:

```bash
python manage.py check_domains --interval 900    # loop every 15 min
python manage.py check_domains --once             # single pass
```

`deploy/systemd/vericlick-domain-check.{service,timer}` and `deploy/cron.example` are ready-to-adapt.

## Key environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SECRET_KEY` | backend `.env` | Django secret (required when `DEBUG=False`) |
| `ALLOWED_HOSTS` | backend `.env` | Required when `DEBUG=False` |
| `DATABASE_URL` | backend `.env` | Single PostgreSQL URL (Postgres runs in Docker and seeds from it) |
| `PUBLIC_TRACKING_BASE_URL` | backend `.env` | Base URL used when generating tracked links |
| `CORS_ALLOWED_ORIGINS` | backend `.env` | Frontend origins allowed to call the API |
| `GOOGLE_CLIENT_ID` | backend `.env` | Google OAuth client ID; empty disables Google sign-in |
| `GEOIP2_DB` | backend `.env` | Optional GeoIP2 database for country/region/city enrichment |

Business toggles are **admin-managed** (Jazzmin), not env-based: "beta free mode"
(limits off, everything free) and "sign-ups open/closed" live in the
`vericlick.SiteConfig` singleton at `/admin/vericlick/siteconfig/`. Plans and
discount codes are also managed in the admin (`/admin/vericlick/plan/`,
`/admin/vericlick/discountcode/`). `.env` is reserved for infrastructure and
security settings only (secret, hosts, DB, CORS, OAuth, GeoIP).
| `VITE_API_BASE_URL` | frontend `.env` | Backend URL |
| `VITE_SITE_URL` | frontend `.env` | Deployed domain for SEO files |
| `VITE_GOOGLE_CLIENT_ID` | frontend `.env` | Google OAuth client ID (must match backend `GOOGLE_CLIENT_ID`) |
