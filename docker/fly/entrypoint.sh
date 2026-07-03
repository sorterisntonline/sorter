#!/bin/bash
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required"
  exit 1
fi

# normalize postgresql:// URLs and keep ssl params for downstream consumers
export DATABASE_URL="${DATABASE_URL/postgresql:\/\//postgres:\/\/}"
export PGSSLMODE="${PGSSLMODE:-require}"
export PORT="${PORT:-8080}"
export ENVIRONMENT="${ENVIRONMENT:-staging}"
export REPL_PASSWORD="${REPL_PASSWORD:-fly-repl-password}"
export HOSTNAME="${HOSTNAME:-localhost}"
export BORTER_LOG_PATH="${BORTER_LOG_PATH:-/app/borter/logs}"
export BORTER_LOG_LEVEL="${BORTER_LOG_LEVEL:-info}"
export AUTO_LOGIN="${AUTO_LOGIN:-true}"
export NO_RATE_LIMITS="${NO_RATE_LIMITS:-true}"
export RUSTSORTER_URL="${RUSTSORTER_URL:-http://127.0.0.1:8081}"

exec supervisord -c /etc/supervisor/conf.d/supervisord.conf
