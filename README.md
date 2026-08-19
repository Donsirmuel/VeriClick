# VeriClick

Script-first bot protection & smart redirect platform. Customers paste a single `<script>` tag onto their website — VeriClick blocks bots, logs analytics, and optionally handles smart redirects through an edge proxy.

## How it works

1. **Install protection** — paste one `<script>` tag into your site's `<head>`. The script runs five detection layers (canvas fingerprint, mouse trajectory, TLS/JA4, proof-of-work, behavioral scoring) and sends signals to the API for a verdict.
2. **Real visitors pass through** — humans get a clean `allow` verdict and normal page load. Bots, scrapers, and ad fraud are blocked, trapped in a honeypot, or logged — configurable per workspace.
3. **Smart redirects (optional)** — CNAME your redirect domain to `edge.vericlick.cc` (external edge proxy on FlokiNET) and it handles traffic routing with the same bot detection, geo-rules, and IP blocking. The control-plane APIs in this repo (`/api/edge/*`) manage route sync, domain validation, and event batching.

## Repository layout

```
vericlick-backend/    Django 6 + DRF REST API (JWT auth, shield engine, analytics)
vericlick-frontend/   React 19 + Vite + TypeScript SPA (dashboard, landing, CRUD)
deploy/               deploy.sh, nginx configs, systemd units, cron examples
```

The edge proxy (`edge.vericlick.cc`) is a separate FastAPI + Redis service
deployed on FlokiNET. It is not in this repo — this repo contains the
control-plane APIs (`/api/edge/*`) that the edge proxy calls to sync routes,
validate domains, and batch events.

See `HANDOFF.md` for a deep technical handoff and `DEPLOYMENT.md` for the launch checklist.

## Backend (Django + DRF)

- Python 3.13, Django 6.0, DRF 3.16, SimpleJWT, dnspython
- All JSON is camelCase on the wire (snake_case in Django)
- 263 tests (`python manage.py test --settings=Vericlick_project.settings_test`)

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

- `VITE_API_BASE_URL=https://vericlick.site/api` — backend origin
- `VITE_SITE_URL` — deployed domain; used by `SEOHead.tsx` for per-page canonical URLs

`npm run build` runs `tsc -b && vite build` and emits per-route chunks; `npm run lint` runs oxlint.

## Key environment variables

| Variable | Where | Purpose |
|---|---|---|
| `SECRET_KEY` | backend `.env` | Django secret (required when `DEBUG=False`) |
| `ALLOWED_HOSTS` | backend `.env` | Required when `DEBUG=False` |
| `DATABASE_URL` | backend `.env` | Single PostgreSQL URL |
| `TRUST_X_FORWARDED_PROTO` | backend `.env` | Enable when behind Caddy proxy |
| `CORS_ALLOWED_ORIGINS` | backend `.env` | Frontend origins allowed to call the API |

## Pricing model

All plans include unlimited bot-protected sites and the full 5-layer detection engine. Plans differ only by domain limit:

| Plan | Domain Limit | Redirect Links | Redirect Validity |
|---|---|---|---|
| Basic | 5 | 1 per domain | 7 days |
| Plus | 10 | 1 per domain | 7 days |
| Pro | 20 | 1 per domain | 7 days |
