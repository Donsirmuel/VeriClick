#!/usr/bin/env bash
#
# VeriClick Edge Proxy — run / operate the edge stack (Docker Compose).
#
# The edge runs on its OWN server, separate from the app. Both bind :80/:443,
# so they cannot share a host, and deploy.sh does not touch this stack at all.
#
# Usage:
#   ./deploy-edge.sh up        build and start the stack (default)
#   ./deploy-edge.sh down      stop the stack (Redis volume persists)
#   ./deploy-edge.sh restart   restart all services
#   ./deploy-edge.sh reload    reload Caddy's config without dropping traffic
#   ./deploy-edge.sh logs      tail logs (optionally: ./deploy-edge.sh logs caddy)
#   ./deploy-edge.sh status    show container status
#   ./deploy-edge.sh update    pull, rebuild, restart, reload Caddy, health-check
#   ./deploy-edge.sh check     verify DNS, TLS and sync against the live backend
#
# `update` exists because `docker compose up -d` is NOT enough here. The
# Caddyfile is a bind-mounted file: changing it does not change the container's
# definition, so Compose leaves Caddy running with the old config still loaded
# in memory. Every Caddyfile change needs an explicit reload, which is easy to
# forget and produces no error when missed.
#
set -euo pipefail

# Resolve before cd: BASH_SOURCE may be relative, and the usage text below
# reads this file back by path.
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDGE_DIR="$PROJECT_ROOT/edge-proxy"
cd "$EDGE_DIR"

ENV_FILE="$EDGE_DIR/.env"

require_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE does not exist."
    echo "Create it first:  cp edge-proxy/.env.example edge-proxy/.env"
    exit 1
  fi
  for key in BACKEND_URL EDGE_API_KEY EDGE_HOSTNAME; do
    if ! grep -qE "^${key}=.+" "$ENV_FILE"; then
      echo "ERROR: missing $key in $ENV_FILE (required)."
      exit 1
    fi
  done
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker is not installed."
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "ERROR: 'docker compose' is not available."
    exit 1
  fi
}

env_value() {
  # Read a key from .env without sourcing it (values may contain spaces/quotes).
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | tr -d '"'"'"'' | tr -d '\r'
}

validate_caddyfile() {
  echo "==> Validating the Caddyfile before touching the running stack..."
  local edge_host script_host script_origin
  edge_host="$(env_value EDGE_HOSTNAME)"
  script_host="$(env_value SCRIPT_HOSTNAME)"
  script_origin="$(env_value SCRIPT_ORIGIN)"

  # Fall back to the same defaults docker-compose.yml uses, so validation does
  # not fail merely because an optional variable is unset.
  : "${script_host:=cdn.vericlick.cc}"
  : "${script_origin:=https://vericlick.site}"

  if ! docker run --rm \
    -v "$EDGE_DIR/Caddyfile:/etc/caddy/Caddyfile:ro" \
    -e "EDGE_HOSTNAME=$edge_host" \
    -e "SCRIPT_HOSTNAME=$script_host" \
    -e "SCRIPT_ORIGIN=$script_origin" \
    caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    echo "ERROR: the Caddyfile is not valid. Nothing was changed."
    echo "Run this to see why:"
    echo "  docker run --rm -v \"$EDGE_DIR/Caddyfile:/etc/caddy/Caddyfile:ro\" \\"
    echo "    -e EDGE_HOSTNAME=$edge_host caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile"
    exit 1
  fi
  echo "    Caddyfile OK."
}

reload_caddy() {
  # A graceful reload: Caddy re-reads the file with no dropped connections.
  echo "==> Reloading Caddy's config..."
  if docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null; then
    echo "    Reloaded."
  else
    echo "    Graceful reload failed; restarting the container instead."
    docker compose restart caddy
  fi
}

wait_healthy() {
  local host url
  host="$(env_value EDGE_HOSTNAME)"
  url="https://${host}/health"
  echo "Waiting for the edge to answer at $url ..."
  for _ in $(seq 1 30); do
    # The health route must return "ok" — if it returns a page, the catch-all
    # is shadowing it and the running config is stale.
    if [[ "$(curl -fsS -m 5 "$url" 2>/dev/null || true)" == "ok" ]]; then
      echo "OK — the edge is up."
      return 0
    fi
    sleep 2
  done
  echo "WARNING: $url did not return 'ok'."
  echo "Check the logs:  ./deploy-edge.sh logs caddy"
  return 1
}

cmd_up() {
  require_env; require_docker; validate_caddyfile
  docker compose up -d --build
  reload_caddy
  wait_healthy || true
}

cmd_down() {
  require_docker
  docker compose down
}

cmd_restart() {
  require_docker
  docker compose restart
  wait_healthy || true
}

cmd_reload() {
  require_env; require_docker; validate_caddyfile
  reload_caddy
}

cmd_logs() {
  require_docker
  docker compose logs -f --tail=100 "${1:-}"
}

cmd_status() {
  require_docker
  docker compose ps
}

cmd_update() {
  require_env; require_docker

  echo "==> Pulling latest code..."
  git -C "$PROJECT_ROOT" pull --ff-only

  validate_caddyfile

  echo "==> Building the new image (the running stack keeps serving)..."
  docker compose build

  echo "==> Swapping the stack..."
  docker compose up -d

  # Compose will not restart Caddy for a changed bind-mounted Caddyfile, so
  # reload explicitly — this is the step that silently gets skipped otherwise.
  reload_caddy

  wait_healthy || {
    echo
    echo "The edge did not come up cleanly. Inspect and, if needed, roll back:"
    echo "  ./deploy-edge.sh logs caddy"
    echo "  git -C $PROJECT_ROOT log --oneline -5"
    exit 1
  }

  echo
  echo "Update complete. Verify the whole path with:  ./deploy-edge.sh check"
}

cmd_check() {
  require_env; require_docker

  local edge_host backend
  edge_host="$(env_value EDGE_HOSTNAME)"
  backend="$(env_value BACKEND_URL)"

  echo "==> Edge health"
  local health
  health="$(curl -fsS -m 10 "https://${edge_host}/health" 2>/dev/null || echo FAILED)"
  if [[ "$health" == "ok" ]]; then
    echo "    ${edge_host}/health -> ok"
  else
    echo "    ${edge_host}/health -> '$health'"
    echo "    If this is HTML, Caddy is running a stale config. Run: ./deploy-edge.sh reload"
  fi

  echo "==> Backend reachability (used for route sync and on-demand TLS)"
  if curl -fsS -m 10 -o /dev/null "${backend}/api/health/"; then
    echo "    ${backend} reachable"
  else
    echo "    WARNING: cannot reach ${backend} — routes will not sync."
  fi

  echo "==> Routes currently cached in Redis"
  local n
  n="$(docker compose exec -T redis redis-cli --scan --pattern 'routes:*' 2>/dev/null | wc -l || echo 0)"
  echo "    $n route(s) cached"
  if [[ "$n" == "0" ]]; then
    echo "    None cached. Check EDGE_API_KEY and:  ./deploy-edge.sh logs app"
  fi

  echo "==> Customer domain TLS"
  echo "    On-demand certificates are issued on first request. To test one:"
  echo "      curl -sS -o /dev/null -w '%{http_code} -> %{redirect_url}\\n' https://<your-link>"
}

case "${1:-up}" in
  up)       cmd_up ;;
  down)     cmd_down ;;
  restart)  cmd_restart ;;
  reload)   cmd_reload ;;
  logs)     shift || true; cmd_logs "${1:-}" ;;
  status)   cmd_status ;;
  update)   cmd_update ;;
  check)    cmd_check ;;
  *)
    echo "Unknown command: $1"
    sed -n '7,17p' "$SCRIPT_PATH"
    exit 1
    ;;
esac
