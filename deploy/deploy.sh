#!/usr/bin/env bash
#
# VeriClick — run / operate the app on the InterServer VPS (Docker Compose).
#
# Usage:
#   ./deploy.sh up        build and start the stack (default)
#   ./deploy.sh down      stop the stack (database volume persists)
#   ./deploy.sh restart   restart all services
#   ./deploy.sh logs      tail logs (optionally: ./deploy.sh logs backend)
#   ./deploy.sh status    show container status
#   ./deploy.sh backup    dump Postgres + Caddy certs into backups/
#   ./deploy.sh update    safe update: backup, pull, check, migrate, swap, health-check
#   ./deploy.sh rollback  swap back to the previously-running images (from ./deploy.sh update)
#   ./deploy.sh admin     create a Django superuser
#
# update order matters: the DB is dumped before anything changes, the NEW
# backend image is built and its migrations are applied while the OLD stack
# keeps serving, and only then are containers swapped. If the new stack fails
# its health check, `./deploy.sh rollback` puts the previous images back.
#
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="$PROJECT_ROOT/.env"

require_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE does not exist."
    echo "Create it first:  cp .env.example .env  (then fill in the values)."
    exit 1
  fi
  # Fail closed: make sure required secrets are not placeholders.
  for key in SECRET_KEY DATABASE_URL ALLOWED_HOSTS CORS_ALLOWED_ORIGINS \
             CSRF_TRUSTED_ORIGINS PUBLIC_TRACKING_BASE_URL VITE_API_BASE_URL VITE_SITE_URL; do
    if ! grep -qE "^${key}=.+" "$ENV_FILE"; then
      echo "ERROR: missing $key in $ENV_FILE (required)."
      exit 1
    fi
  done
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker not found. Install it with:"
    echo "  curl -fsSL https://get.docker.com | sh && systemctl enable --now docker"
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: 'docker compose' (v2) plugin not found."
    exit 1
  fi
}

wait_healthy() {
  echo "Waiting for the app to come up at http://localhost/api/health/ ..."
  for i in $(seq 1 60); do
    if curl -sf http://localhost/api/health/ >/dev/null 2>&1; then
      echo "OK — the app is up."
      return 0
    fi
    sleep 2
  done
  echo "WARNING: the health endpoint did not respond within 120s."
  echo "Check logs:  ./deploy.sh logs"
  return 1
}

cmd_up() {
  require_env
  require_docker
  docker compose up -d --build
  wait_healthy || true
  echo
  echo "VeriClick should be live. Verify:"
  echo "  https://getvericlick.site            (SPA)"
  echo "  https://getvericlick.site/admin/     (Jazzmin admin)"
}

cmd_down() {
  require_docker
  docker compose down
  echo "Stopped. The database (pgdata volume) is preserved."
}

cmd_restart() {
  require_docker
  docker compose restart
}

cmd_logs() {
  require_docker
  docker compose logs -f --tail=200 "${1:-}"
}

cmd_status() {
  require_docker
  docker compose ps
}

cmd_backup() {
  require_docker
  mkdir -p backups
  DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  # from inside the db container, connect to localhost instead of the "db" host
  DB_URL="${DB_URL//@db:5432/@localhost:5432}"
  docker compose exec -T db pg_dump "$DB_URL" > "backups/vericlick-$(date +%F-%H%M).sql"
  echo "Postgres dumped to backups/vericlick-$(date +%F-%H%M).sql"
  docker compose exec -T frontend tar czf - /data > "backups/caddy-$(date +%F-%H%M).tgz"
  echo "Caddy certs dumped to backups/caddy-$(date +%F-%H%M).tgz"
  echo "Tip: also copy backups/ off the server."
}

cmd_update() {
  require_env
  require_docker

  echo "==> Pulling latest code..."
  git pull --ff-only

  echo "==> Backing up the database + Caddy certs before any change..."
  cmd_backup

  echo "==> Building the new images (the running stack keeps serving)..."
  docker compose build backend frontend

  echo "==> System checks with the NEW backend against the live DB..."
  if ! docker compose run --rm --no-deps backend python manage.py check 2>&1; then
    echo
    echo "ERROR: Django system check failed — nothing was changed. Fix the code and retry."
    return 1
  fi

  echo "==> Migration plan (what will be applied):"
  docker compose run --rm --no-deps backend python manage.py migrate --plan || true

  echo "==> Applying migrations with the NEW code while the OLD app still serves..."
  docker compose run --rm --no-deps backend python manage.py migrate --noinput

  echo "==> Tagging the current images so 'deploy.sh rollback' can restore them..."
  docker tag vericlick-backend vericlick-backend:previous || true
  docker tag vericlick-frontend vericlick-frontend:previous || true

  echo "==> Swapping the stack to the new images..."
  docker compose up -d --no-build
  wait_healthy || true
  echo
  echo "Update complete. If something is wrong: ./deploy.sh rollback"
  echo "DB backup (if you need to restore data): latest file in backups/"
}

cmd_rollback() {
  require_docker
  if docker image inspect vericlick-backend:previous >/dev/null 2>&1; then
    docker tag vericlick-backend:previous vericlick-backend:latest
  fi
  if docker image inspect vericlick-frontend:previous >/dev/null 2>&1; then
    docker tag vericlick-frontend:previous vericlick-frontend:latest
  fi
  echo "==> Restarting the stack from the previous images..."
  docker compose up -d --no-build
  wait_healthy || true
  echo
  echo "Rollback done. If the DB schema itself needs reverting, restore the"
  echo "latest dump in backups/ with pg_restore (ask before doing this)."
}

cmd_admin() {
  require_docker
  docker compose exec backend python manage.py createsuperuser
}

case "${1:-up}" in
  up|start)     cmd_up ;;
  down|stop)    cmd_down ;;
  restart)      cmd_restart ;;
  logs)         shift; cmd_logs "$@" ;;
  status|ps)    cmd_status ;;
  backup)       cmd_backup ;;
  update)       cmd_update ;;
  rollback)     cmd_rollback ;;
  admin)        cmd_admin ;;
  *)            echo "Unknown command: $1"; grep -E '^#   \./' "$0" | head -20 ;;
esac
