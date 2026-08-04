# VeriClick Deployment Guide

This is the launch checklist for taking VeriClick from a local checkout to a production deployment. It exists so "it runs on my machine" becomes a repeatable, verifiable process.

The architecture: a **Django + DRF API** (`vericlick-backend/`) and a
**React/Vite SPA** (`vericlick-frontend/`) served as static files. They can live on the same host or split across providers (e.g. API on Fly Railway, SPA on Cloudflare Pages/Vercel).

---

## 1. Backend

### Prereqs
- Python 3.12+ (CI runs 3.12)
- PostgreSQL recommended for production (SQLite works for dev/small scale)

### Steps
1. Install dependencies:
   ```bash
   cd vericlick-backend/Vericlick_project
   python -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```
2. Configure the environment — copy `Vericlick_project/.env.example` to
   `Vericlick_project/.env` and set every value. **The app refuses to start with
   `DEBUG=False` unless `SECRET_KEY` and `ALLOWED_HOSTS` are set explicitly.**
   Required in production:
   - `DEBUG=False`
   - `SECRET_KEY` — strong value, e.g. `python -c "import secrets; print(secrets.token_urlsafe(50))"`
   - `ALLOWED_HOSTS` — your real domains, e.g. `vericlick.io,api.vericlick.io`
   - `CORS_ALLOWED_ORIGINS` — the SPA origin(s), e.g. `https://vericlick.io`
   - `CSRF_TRUSTED_ORIGINS` — same origins (needed for browser POSTs)
   - `DATABASE_URL` — `postgres://user:password@host:5432/vericlick`
   - `TRUST_X_FORWARDED_PROTO=True` only when behind a trusted proxy
   - `GEOIP2_DB` — path to a GeoLite2-City.mmdb for real location data
     (optional; offline fallback returns Localhost/Private/Unknown)
3. Run migrations and collect static files:
   ```bash
   .venv/bin/python manage.py migrate
   .venv/bin/python manage.py collectstatic --noinput
   ```
4. Run the deploy security checks:
   ```bash
   .venv/bin/python manage.py check --deploy
   ```
   (Warnings here point at settings that are intentionally overridden for
   serving behind a proxy — verify each against your host.)
5. Serve with gunicorn behind nginx/Cloudflare:
   ```bash
   .venv/bin/gunicorn Vericlick_project.wsgi:application --workers 3 --bind 127.0.0.1:8000
   ```
6. **Schedule the domain health scanner (REQUIRED).** The scanner flips domain
   `verified`/`health_status` and updates scan timestamps. Pick one:
   - **systemd** — copy `deploy/systemd/vericlick-domain-check.{service,timer}`
     to `/etc/systemd/system/`, then `systemctl enable --now vericlick-domain-check.timer`
   - **cron** — see `deploy/cron.example` (`*/15 * * * * ... check_domains --once`)
   - **PaaS** — most platforms have a cron/scheduled job runner; run
     `python manage.py check_domains --once` every 15 minutes.

### GeoIP (production, recommended)
1. `pip install geoip2`
2. Download a GeoLite2-City database (MaxMind), place it somewhere readable,
   and set `GEOIP2_DB=/absolute/path/GeoLite2-City.mmdb`.
3. Activity feeds and blocked-IP reviews will show country/region/city.

---

## 2. Frontend

1. Configure `vericlick-frontend/.env` (see `.env.example`):
   - `VITE_MOCK_MODE=false` — always false in production
   - `VITE_API_BASE_URL=https://api.vericlick.io/api` — the backend URL
   - `VITE_SITE_URL=https://vericlick.io` — drives the generated `robots.txt`
     and `sitemap.xml` (must match the deployed domain)
2. Build the SPA:
   ```bash
   npm ci
   npm run build
   ```
   `dist/` is a static bundle — `robots.txt` and `sitemap.xml` are generated
   into it from `VITE_SITE_URL`. Deploy to any static host and configure SPA
   fallback so `/app/*`, `/auth/*` and `/r/*` serve `index.html`.

### Proxy `/r/<slug>` to the backend
The public redirect route must reach Django. On a static host, proxy or rewrite
`/r/*` (and optionally `/api/*`, `/suspicious/`, `/robots.txt`, `/sitemap.xml`)
to the backend. If you can't proxy, use a custom tracking domain pointing at the
backend directly so `/r/<slug>` runs on Django.

---

## 3. Post-deploy verification

Run through the release checklist once deployed:

- [ ] `https://<api>/api/health/` returns `{"status":"ok"}` with HTTPS
- [ ] Backend refuses to boot without `SECRET_KEY`/`ALLOWED_HOSTS` when
      `DEBUG=False`
- [ ] Create a user, add a domain, publish the TXT record, and `POST
      /api/domains/<id>/verify/` marks it verified
- [ ] Visit a tracked link as a normal browser → lands on the destination
- [ ] `curl -A "python-requests" <tracked-url>` → redirected to the safe
      destination (or `/suspicious/`)
- [ ] Whitelisting a blocked IP from the dashboard lets that IP through again
- [ ] Domain scanner job is active (`systemctl list-timers` or the cron entry)
      and `last_domain_scan_at` updates every 15 minutes
- [ ] `robots.txt`/`sitemap.xml` on the public host use the deployed domain
- [ ] CORS: browser requests from the SPA origin succeed, others are rejected
- [ ] Secure headers present (HSTS, nosniff) when `DEBUG=False`
