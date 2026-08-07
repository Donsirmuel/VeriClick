# VeriClick — VPS Deployment Runbook (InterServer)

Step-by-step plan for taking a fresh clone on the VPS to a live, HTTPS-served,
sign-in-enabled product at **vendora.page**.

Everything below runs on the VPS over SSH unless it says "on your local machine".

---

## Step 1 — Confirm the server is ready

```bash
docker compose version        # must print "Docker Compose version v2.x"
git --version
ss -ltn                       # confirm nothing already listens on :80 / :443
```

If Docker is missing:

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

---

## Step 2 — Point DNS at the VPS (start BEFORE step 5)

In your DNS provider's panel, create:

| Type | Name              | Value          |
|------|-------------------|----------------|
| A    | `vendora.page`    | `<VPS IP>`     |
| A    | `www.vendora.page`| `<VPS IP>`     |

Check propagation (repeat until both resolve):

```bash
dig +short vendora.page
dig +short www.vendora.page
```

> Caddy (in the frontend container) refuses to issue a Let's Encrypt certificate
> until this resolves to this server. Do this now; DNS can take minutes to hours.

---

## Step 3 — Create and fill `.env`

You cloned the repo. Navigate to it and create the environment file:

```bash
cd vericlick
cp .env.example .env
nano .env
```

Fill in every line. The compose file uses `:?` guards, so the app **refuses to
refuse to
start** if `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_HOSTS`,
`CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `PUBLIC_TRACKING_BASE_URL`, and
the `VITE_*` values are missing.

### Generate the one secret

```bash
python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"   # -> SECRET_KEY
openssl rand -hex 32                                                                                            # -> the DB password (inside DATABASE_URL)
```

> PostgreSQL runs entirely inside the Docker stack (`db` service). The app
> connects to it and the `db` container self-seeds using the **single
> `DATABASE_URL`** — there are no separate `POSTGRES_*` vars. Get the password
> into the URL by replacing `replace-me-with-a-strong-db-password` in the
> example below (password must not contain `@`, `/`, or `:`).

### Variable-by-variable

| Variable                    | Value for this deploy                                                        |
|-----------------------------|------------------------------------------------------------------------------|
| `DATABASE_URL`              | `postgres://vericlick:YOUR_STRONG_PASSWORD@db:5432/vericlick` (single DB value) |
| `SECRET_KEY`                | random Django key from above                                                 |
| `ALLOWED_HOSTS`             | `vendora.page,www.vendora.page`                                              |
| `CORS_ALLOWED_ORIGINS`      | `https://vendora.page,https://www.vendora.page`                              |
| `CSRF_TRUSTED_ORIGINS`      | `https://vendora.page,https://www.vendora.page`                              |
| `PUBLIC_TRACKING_BASE_URL`  | `https://vendora.page`                                                       |
| `GOOGLE_CLIENT_ID`          | your OAuth client ID (same string as `VITE_GOOGLE_CLIENT_ID`); blank disables |
| `VITE_API_BASE_URL`         | `https://vendora.page/api`                                                   |
| `VITE_SITE_URL`             | `https://vendora.page`                                                       |
| `VITE_GOOGLE_CLIENT_ID`     | same client ID as `GOOGLE_CLIENT_ID`                                         |
| `SITE_ADDRESSES`            | `vendora.page www.vendora.page` (space-separated — Caddy syntax)            |

> ⚠️ The two Google client-ID variables **must match**. The `VITE_GOOGLE_CLIENT_ID`
> is baked into the frontend at **build time** — if you change it later you must
> rebuild (`bash deploy.sh up` rebuilds, so that's automatic).

Save (`Ctrl+O`, `Enter`, `Ctrl+X`). Keep `.env` secret — it's gitignored.

---

## Step 4 — Open the firewall ports

Let's Encrypt's HTTP-01 challenge needs port 80 reachable, and users need 443.

**InterServer control panel:** allow inbound TCP **80** and **443** for the VPS.

**OS firewall**, if enabled (CentOS/Alma `firewalld`):

```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload
```

Confirm:

```bash
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload    # shows http https (if firewalld is running)
```

If no firewall is active, skip this step.

---

## Step 5 — Deploy (this is where `deploy.sh` runs)

```bash
bash deploy/deploy.sh up
```

What happens, in order:

1. **`require_env`** — fails fast if `.env` is missing or lacks a required key.
2. **`require_docker`** — checks `docker` + `docker compose` (v2) exist.
3. **`docker compose up -d --build`**:
   - Pulls `postgres:16-alpine`.
   - Builds `backend` — installs Python deps (takes a few minutes the first time),
     then its CMD runs `migrate --noinput` → `collectstatic --noinput` → Gunicorn
     (3 workers, `:8000`). The container waits for Postgres to be healthy first.
   - Builds `frontend` — compiles the React app with your `VITE_*` values, then
     starts Caddy on `:80` / `:443`. Caddy begins obtaining the certs for
     `SITE_ADDRESSES`.
4. **`wait_healthy`** — polls `http://localhost/api/health/` (proxied by Caddy to
   Gunicorn) every 2s for up to 2 minutes, then prints whether it's up.

If the health check warns, keep reading — verify next.

---

## Step 6 — Verify the deployment

```bash
docker compose ps
```

Expect 3 lines: `db` (healthy), `backend` (running), `frontend` (running).

```bash
docker compose logs backend --tail=50    # migrations ran, gunicorn listening
docker compose logs frontend --tail=50    # caddy obtained certificates?
```

Check TLS certs were issued (if DNS was already resolving):

```bash
docker compose exec frontend ls /data/caddy/certificates
```

Then, from your **local machine**:

```bash
curl -I https://vendora.page                                  # HTTP/2 200
curl -s https://vendora.page/api/health/                      # {"status":"ok",...}
curl -sI https://vendora.page/admin/                          # 200 (Jazzmin login)
curl -sI https://vendora.page/pricing                         # 200 (SPA, no 404)
```

> If `curl -I https://...` fails but `docker compose ps` looks fine, it's almost
> always one of: DNS not propagated yet, port 80/443 closed, or Caddy mid-issuance.
> Re-run the checks in ~10 minutes before troubleshooting further.

---

## Step 7 — Create your first admin

The fresh Postgres has **no users** (the old local dev `admin` doesn't exist here).
Create a real superuser:

```bash
bash deploy/deploy.sh admin
# Username: admin (or your name)
# Email: ...
# Password: a STRONG one you haven't used for the dev server
```

Log in at `https://vendora.page/admin/` and change the password if you set a
temporary one. Do **not** reuse the old `VeriClickAdmin!2026`.

---

## Step 8 — Enable Google sign-in for production

1. Go to Google Cloud Console → APIs & Services → Credentials → your OAuth Web client.
2. Under **Authorized JavaScript origins**, add:
   - `https://vendora.page`
   - `https://www.vendora.page`
   - (keep your dev origin, e.g. `http://localhost:5173`, only if you still run local dev)
3. Save.

If you get a `403 origin not allowed` on the sign-in popup, it means one of the
origins above is missing from Google — the frontend origin must match exactly.

If you changed `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` in `.env` after the
first deploy, run `bash deploy.sh up` again to rebuild with the new value.

---

## Step 9 — Configure the product in the admin

At `https://vendora.page/admin/vericlick/siteconfig/`:

- Set **beta mode / free tier** and **sign-ups open** to the launch configuration.
- Confirm the neutral/suspicious destination and workspace defaults.

Then `bash deploy.sh restart` only if Django caches config aggressively —
normally no restart is needed since `site-config` is read per request.

---

## Step 10 — End-to-end smoke test (as a real user)

1. Register a new account (or use your admin).
2. Create a workspace and a short link.
3. Copy the shareable link (`PUBLIC_TRACKING_BASE_URL` should appear — e.g.
   `https://vendora.page/r/<slug>`).
4. Open it in an incognito tab → lands on the destination; visit `/suspicious/`
   → neutral redirect works.
5. Check the dashboard shows the click.

Also run the automated check: `bash deploy.sh status`.

---

## Step 11 — Backups and survival across reboots

### Backups (run now, then automate)

```bash
bash deploy.sh backup
```

Writes `backups/vericlick-<timestamp>.sql` (Postgres) and
`backups/caddy-<timestamp>.tgz` (Caddy certs, in case you reinstall). Copy them
off the server (`scp`/rsync) — a backup that lives on the same disk is not a backup.

### Start on boot

InterServer reboots happen. Register the stack with systemd:

```bash
sudo tee /etc/systemd/system/vericlick.service >/dev/null <<'EOF'
[Unit]
Description=VeriClick Docker Compose stack
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/vericlick
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now vericlick
```

(Adjust `WorkingDirectory` if you cloned elsewhere. Verify the docker path with
`command -v docker`.)

### Nightly backups with cron

```bash
crontab -e
```

```cron
0 3 * * * cd /root/vericlick && bash deploy/deploy.sh backup >/dev/null 2>&1
```

---

## Step 12 — Update the app later

```bash
# on the VPS:
bash deploy/deploy.sh update     # git pull --ff-only + rebuild + restart
```

---

## Troubleshooting cheat-sheet

| Symptom | Fix |
|---|---|
| `deploy.sh up` aborts with "missing X in .env" | Fill that key in `.env` and rerun. |
| `curl https://...` doesn't respond | DNS not propagated / port 80+443 blocked / firewall. Check Step 2 & 4. |
| Caddy logs show ACME/order/authorization errors | DNS must resolve to this exact IP; retry in a few minutes. |
| Sign-in popup: `403 origin not allowed` | Add `https://vendora.page` to Google's Authorized JS origins (Step 8). |
| Frontend behaves wrong after editing VITE_* | Rebuild: `bash deploy.sh up` (values are baked at build time). |
| App up but broken / 500s | `docker compose logs backend --tail=100` and `... frontend ...`. |
| Want a fully clean slate | `docker compose down -v` (deletes **all** data incl. Postgres + certs) then `bash deploy.sh up`. |
| Free-tier sign-ups not working | In admin SiteConfig, confirm `signups_open` and beta mode toggles. |

---

## Checklist (tick through)

- [ ] DNS A records for `vendora.page` + `www` → VPS IP
- [ ] `.env` created with real secrets and prod origins
- [ ] Ports 80/443 open (panel + firewall)
- [ ] `bash deploy.sh up` completes, health check OK
- [ ] `https://vendora.page` serves the SPA with a valid cert
- [ ] `/admin/` logs in with a new superuser
- [ ] Google JS origin added; sign-in works end to end
- [ ] SiteConfig toggles set for launch
- [ ] `deploy.sh backup` produced a `.sql` + certs and files copied off-server
- [ ] systemd unit enabled so it survives reboots
