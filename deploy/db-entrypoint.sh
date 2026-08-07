#!/bin/sh
# vericlick-db-entrypoint
#
# Lets the postgres:16 Docker container seed its initial superuser + database
# from a SINGLE DATABASE_URL, so there is no separate set of POSTGRES_* vars to
# keep in sync. It parses user / password / db out of the URL, exports the
# POSTGRES_* vars the official image expects, then defers to its own entrypoint.
#
# URL shape: postgres://USER:PASSWORD@HOST:PORT/DATABASE
# Constraints: password must not contain "@", "/", or ":" characters.
set -e

URL="${DATABASE_URL:-}"
if [ -z "$URL" ]; then
  echo "vericlick-db-entrypoint: DATABASE_URL is required" >&2
  exit 1
fi

REST="${URL#*://}"        # everything after the scheme, e.g. user:pass@db:5432/vericlick
USERPASS="${REST%%@*}"     # user:pass
DB="${REST##*/}"           # database name = last path segment
USER="${USERPASS%%:*}"     # user
PASS="${USERPASS#*:}"      # password (everything after first ':')

export POSTGRES_USER="${POSTGRES_USER:-$USER}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$PASS}"
export POSTGRES_DB="${POSTGRES_DB:-$DB}"

exec /usr/local/bin/docker-entrypoint.sh "$@"