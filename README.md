# VeriClick

Link protection for real traffic. VeriClick verifies every click in under 50ms, blocks bots and automated traffic before they reach your pages, and shows a plain-language reason for every decision.

## How it works

1. **Create a tracked link** — paste a destination URL, get a short `/r/<slug>` link (optionally on a domain you own).
2. **Every click is classified** — allow/deny IP rules first, then browser/UA heuristics, then rate limiting. Humans are 302-routed to the real destination; flagged traffic is diverted to your `safe_destination` (or VeriClick's built-in protected page) — never a 403, never the real page.
3. **Monitor** — dashboard stats, traffic chart, live activity feed, domain health, and a blocked-IP review queue. Each blocked entry explains *why* in plain language.

Domain health is scanned automatically (RBL/blacklist checks), and domain **ownership** is verified separately via a DNS TXT record (`vericlick-verify=<token>`) — a domain can be healthy without being verified, and the UI surfaces both states.

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
- 151 tests (`python manage.py test --settings=Vericlick_project.settings_test`)

```bash
cd vericlick-backend/Vericlick_project
cp Vericlick_project/.env.example Vericlick_project/.env
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Production config is fail-closed: with `DEBUG=False` the app refuses to boot without an explicit `SECRET_KEY` and `ALLOWED_HOSTS`.

## Frontend (React + Vite)

```bash
cd vericlick-frontend
npm install
npm run dev
```

- `VITE_MOCK_MODE=false` — use the real backend (default); any other value uses seeded mock data
- `VITE_API_BASE_URL=http://localhost:8000/api` — backend origin
- `VITE_SITE_URL` — deployed domain; drives build-time `robots.txt` / `sitemap.xml` (default `https://vericlick.io`)

`npm run build` runs `tsc -b && vite build` and emits per-route chunks; `npm run lint` runs oxlint. The build writes `dist/robots.txt` and `dist/sitemap.xml` from `VITE_SITE_URL`.

## Domain health scheduling

Run scans on a loop with a process manager, or on a timer:

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
| `CORS_ALLOWED_ORIGINS` | backend `.env` | Frontend origins allowed to call the API |
| `GEOIP2_DB` | backend `.env` | Optional GeoIP2 database for country/region/city enrichment |
| `VITE_MOCK_MODE` | frontend `.env` | `false` = real API |
| `VITE_API_BASE_URL` | frontend `.env` | Backend URL |
| `VITE_SITE_URL` | frontend `.env` | Deployed domain for SEO files |
