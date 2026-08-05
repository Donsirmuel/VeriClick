# VeriClick Deployment Guide

This is the launch checklist for taking VeriClick from a local checkout to a production deployment. It exists so "it runs on my machine" becomes a repeatable, verifiable process.

The architecture: a **Django + DRF API** (`vericlick-backend/`) and a
**React/Vite SPA** (`vericlick-frontend/`) served as static files. They can live on the same host or split across providers (e.g. API on Fly Railway, SPA on Cloudflare Pages/Vercel).

---

## 1. Backend

### Prereqs
- Python 3.12+ (CI runs 3.12)
- PostgreSQL on the VPS for production data storage

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
   Required on the VPS:
   - `DEBUG=False`
   - `SECRET_KEY` — strong value, e.g. `python -c "import secrets; print(secrets.token_urlsafe(50))"`
   - `ALLOWED_HOSTS` — your real domains, e.g. `vendora.page,www.vendora.page`
   - `CORS_ALLOWED_ORIGINS` — the SPA origin(s), e.g. `https://vendora.page`
   - `CSRF_TRUSTED_ORIGINS` — same origins (needed for browser POSTs)
   - `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_HOST` / `POSTGRES_PORT` — local PostgreSQL on the VPS
   - `PUBLIC_TRACKING_BASE_URL=https://vendora.page`
   - `TRUST_X_FORWARDED_PROTO=True` only when behind a trusted proxy
   - `GOOGLE_CLIENT_ID` — see "Google sign-in setup" below
   - `GEOIP2_DB` — path to a GeoLite2-City.mmdb for real location data
     (optional; offline fallback returns Localhost/Private/Unknown)

   Business toggles are **not** in `.env`. During beta the product is free
   (limits off, unlimited domains) and sign-ups are open — both are flipped in
   the Jazzmin admin under **Site configuration** (`/admin/vericlick/siteconfig/`).
   Paid tiers and discount codes are created there too.
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
5. Serve with gunicorn behind nginx:
   ```bash
   .venv/bin/gunicorn Vericlick_project.wsgi:application --workers 3 --bind 127.0.0.1:8000
   ```
   Use the sample `deploy/systemd/vericlick-gunicorn.service.example` to keep
   the app running as a service.
6. **Domain health scanner (OPTIONAL).** Health checks now run automatically
   from inside the app: whenever the dashboard or domain list is viewed, domains
   whose last check is older than 15 minutes are refreshed on demand
   (`refresh_stale_domains` in `services.py`). A background scheduler is no
   longer required. If you still want proactive checks (so results are fresh even
   before anyone opens the dashboard), pick one:
   - **systemd** — copy `deploy/systemd/vericlick-domain-check.{service,timer}`
     to `/etc/systemd/system/`, then `systemctl enable --now vericlick-domain-check.timer`
   - **cron** — see `deploy/cron.example` (`*/15 * * * * ... check_domains --once`)
   - **PaaS** — most platforms have a cron/scheduled job runner; run
     `python manage.py check_domains --once` every 15 minutes.

### Google sign-in setup
The Google OAuth flow is already wired in (`POST /api/auth/google/` verifies the
id_token and matches its `aud` against `GOOGLE_CLIENT_ID`; the SPA renders the
button whenever `VITE_GOOGLE_CLIENT_ID` is set). The Google Cloud Console must
allow the origin the SPA runs on:

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web app**.
2. **Authorized JavaScript origins** — add the exact origin(s) the SPA runs on:
   add `https://vendora.page` and `https://www.vendora.page`.
   Do **not** add paths — origins only, and the value must match the browser
   URL exactly (scheme + host + port).
3. Copy the client ID into **both** env files:
   - backend `.env`: `GOOGLE_CLIENT_ID=<same id>`
   - frontend `.env`: `VITE_GOOGLE_CLIENT_ID=<same id>`
4. Make sure the SPA origin is also in the backend's `CORS_ALLOWED_ORIGINS`
   so browser calls to the API are allowed.
5. The backend only enforces the audience when `GOOGLE_CLIENT_ID` is set, so an
   empty value cleanly disables Google sign-in on a given environment.

### Where settings live: admin vs `.env` vs code
Keep each kind of setting in exactly one place so operators know where to look:

| Bucket | Examples | Where | How to change |
|---|---|---|---|
| Business/data | Plans (price, domain limit, features), discount codes, workspace plan assignment, beta-free mode, sign-ups open | **Jazzmin admin** (`/admin/...`) | Point and click, no deploy |
| Infrastructure/security | `SECRET_KEY`, `ALLOWED_HOSTS`, DB credentials, `CORS_ALLOWED_ORIGINS`, `PUBLIC_TRACKING_BASE_URL`, `GOOGLE_CLIENT_ID`, `GEOIP2_DB`, `TRUST_X_FORWARDED_PROTO` | **`.env`** | Edit env file, restart Gunicorn |
| App defaults/safety | Default pagination, throttle rates, JWT lifetimes, security headers, `DEBUG` parsing | **`settings.py`** | Code change + deploy |

Rule of thumb: if it changes per-customer or per-promo, put it in the admin. If
it is a deploy/infra concern, put it in `.env`. If it is the same for every
deployment, keep it in code.

### GeoIP (production, recommended)
1. `pip install geoip2`
2. Download a GeoLite2-City database (MaxMind), place it somewhere readable,
   and set `GEOIP2_DB=/absolute/path/GeoLite2-City.mmdb`.
3. Activity feeds and blocked-IP reviews will show country/region/city.

---

## 2. Frontend

1. Configure `vericlick-frontend/.env` (see `.env.example`):
   - `VITE_API_BASE_URL=https://vendora.page/api` — the backend URL on the VPS
   - `VITE_SITE_URL=https://vendora.page` — drives the generated `robots.txt`
     and `sitemap.xml` (must match the deployed domain)
   - `VITE_GOOGLE_CLIENT_ID` — the Google OAuth web client ID (see the Google
     sign-in setup section above)
2. Build the SPA:
   ```bash
   npm ci
   npm run build
   ```
   `dist/` is a static bundle — `robots.txt` and `sitemap.xml` are generated
   into it from `VITE_SITE_URL`. Deploy it behind Nginx on the VPS and let the
   server route `/api/*`, `/r/*`, `/suspicious/`, `robots.txt`, and
   `sitemap.xml` to Django before the SPA fallback catches the rest.

### Nginx routing on InterServer
Use the sample `deploy/nginx/vericlick-vendora.page.conf.example` as the
starting point. The critical rule is that `/r/*` must proxy to Django. If the
frontend handles that path first, tracked links will 404 even though the app
generated them correctly.

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
- [ ] Domain health: open the dashboard, then open the Domains page — both
      trigger a stale-domain refresh in-app, so `last_domain_scan_at` updates
      and domain health stays current without a cron job
- [ ] `robots.txt`/`sitemap.xml` on the public host use the deployed domain
- [ ] CORS: browser requests from the SPA origin succeed, others are rejected
- [ ] Secure headers present (HSTS, nosniff) when `DEBUG=False`
