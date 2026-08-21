# VeriClick Deployment Guide

This is the launch checklist for taking VeriClick from a local checkout to a production deployment. It exists so "it runs on my machine" becomes a repeatable, verifiable process.

The architecture: a **Django + DRF API** (`vericlick-backend/`) and a
**React/Vite SPA** (`vericlick-frontend/`) served as static files. They can live on the same host or split across providers (e.g. API on Fly Railway, SPA on Cloudflare Pages/Vercel).

---

## 0. Docker Compose (recommended)

A single Compose file builds and runs the whole stack on the VPS:

- `db` — PostgreSQL 16
- `backend` — Django + Gunicorn on `:8000` (runs `migrate` then `collectstatic` on start; serves static via WhiteNoise)
- `frontend` — multi-stage build: Vite compiles the SPA, then **Caddy** serves it, reverse-proxies the Django routes, and **auto-manages HTTPS** (Let's Encrypt certs, issued + renewed automatically) — no shared/InterServer cert dependency

### Steps (InterServer VPS — everything happens on the server)

1. **Prereqs:** Docker + Compose plugin installed on the VPS; `vericlick.site` + `www` A records point at the VPS's public IP; Cloudflare proxy enabled (orange-cloud) with SSL/TLS mode set to Full (strict); ports **80 and 443 are open**.
2. **Clone the repo** onto the server and `cd` into it.
3. **Create the environment:**
   ```bash
   cp .env.example .env
   nano .env        # set SECRET_KEY, DATABASE_URL, ALLOWED_HOSTS, CORS, origins, Google IDs, SITE_ADDRESSES
   ```
   The app is **fail-closed**: Compose refuses to start if `SECRET_KEY`,
   `DATABASE_URL`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`,
   `CSRF_TRUSTED_ORIGINS`, `PUBLIC_TRACKING_BASE_URL`, `VITE_API_BASE_URL`, and
   `VITE_SITE_URL` are unset.
4. **Build and start:**
   ```bash
   docker compose up -d --build
   ```
   First run pulls images and runs migrations automatically. Caddy starts with
   the Cloudflare Origin Certificate from `certs/cloudflare/`.
5. **Verify:**
   ```bash
   docker compose ps                          # all three services 'Up' / 'healthy'
   curl -I https://vericlick.site               # 200 (HTTP/2 over TLS)
   curl -s https://vericlick.site/api/health/   # {"status":"ok",...}
   ```
6. **Keep it running across reboots:** InterServer's services manager or a
   systemd unit runs `docker compose up -d`. Rebuilds deploy as
   `docker compose up -d --build`. Certificates live in the `caddy_data` volume
   and renew automatically (Caddy renews ~30 days before expiry).

### Useful commands
```bash
docker compose logs -f api          # follow backend logs
docker compose exec api python manage.py createsuperuser   # first admin
docker compose exec db psql -U vericlick -d vericlick       # psql shell
docker compose down                # stop (data in the pgdata volume persists)
docker compose down -v             # stop AND delete the database (destructive)
```

> Data lives in the named `pgdata` volume, so `docker compose down` and rebuilds
> do not lose your database. Back it up: `docker compose exec -T db pg_dump -U vericlick vericlick > backup.sql`. Certificates live in `caddy_data` — back that up too.

> **TLS via Cloudflare Origin CA:** The origin server uses a Cloudflare Origin
> Certificate (15-year validity, no rate limits) instead of Let's Encrypt ACME.
> Visitors connect to Cloudflare over its public HTTPS cert; Cloudflare talks to
> the VPS over HTTPS using the Origin Certificate.
>
> **Setup:**
> 1. Proxy `vericlick.site` + `www.vericlick.site` in Cloudflare DNS (orange-cloud)
> 2. Set SSL/TLS mode to **Full (strict)**
> 3. Create an Origin Certificate in SSL/TLS → Origin Server for both domains
> 4. Save the cert as `certs/cloudflare/origin.crt` and key as `certs/cloudflare/origin.key`
> 5. `docker compose up -d --build`
>
> **Switching back to Let's Encrypt:** After the rate limit clears, restore the
> ACME config in the Caddyfile and rebuild. Keep Cloudflare proxied if desired.
>
> **Before DNS is live** (smoke-testing behind `<IP>:443`), use `tls internal`
> in the Caddyfile for a self-signed cert. Revert for production.

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
    - `ALLOWED_HOSTS` — your real domains, e.g. `vericlick.site,www.vericlick.site`
    - `CORS_ALLOWED_ORIGINS` — the SPA origin(s), e.g. `https://vericlick.site`
    - `CSRF_TRUSTED_ORIGINS` — same origins (needed for browser POSTs)
    - `DATABASE_URL` — single PostgreSQL URL, e.g. `postgres://vericlick:pass@db:5432/vericlick`; Postgres runs in Docker and seeds itself from this URL (see `deploy/db-entrypoint.sh`)
    - `PUBLIC_TRACKING_BASE_URL=https://vericlick.site`
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

7. **Billing reminders (REQUIRED).** There is no grace period after a plan
   expires — access stops on the date it was paid up to. The warning email is
   therefore the only thing standing between a customer and losing access
   without notice, and it must not depend on that customer happening to log in.

   Docker Compose runs this for you: the `scheduler` service loops
   `check_billing --interval 3600`. Confirm it is up after a deploy:
   ```bash
   docker compose ps scheduler
   docker compose logs --tail=20 scheduler
   ```
   Not using Compose? Run `python manage.py check_billing --once` hourly from
   cron, a systemd timer, or your PaaS scheduler. The same checks also run
   lazily on an owner's own authenticated requests, but that covers only the
   people already logging in — not the ones who need reminding.

### Google sign-in setup
The Google OAuth flow is already wired in (`POST /api/auth/google/` verifies the
id_token and matches its `aud` against `GOOGLE_CLIENT_ID`; the SPA renders the
button whenever `VITE_GOOGLE_CLIENT_ID` is set). The Google Cloud Console must
allow the origin the SPA runs on:

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web app**.
2. **Authorized JavaScript origins** — add the exact origin(s) the SPA runs on:
   add `https://vericlick.site` and `https://www.vericlick.site`.
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
   - `VITE_API_BASE_URL=https://vericlick.site/api` — the backend URL on the VPS
   - `VITE_SITE_URL=https://vericlick.site` — drives the generated `robots.txt`
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
Use the sample `deploy/nginx/vericlick-vericlick.site.conf.example` as the
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
