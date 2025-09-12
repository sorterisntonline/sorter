#!/usr/bin/env bash
set -euo pipefail

# Load env from .env and .env.local if present (local dev convenience)
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi
if [ -f .env.local ]; then
  set -a; . ./.env.local; set +a
fi

# Ensure DATABASE_URL is set for dbmate
: "${DATABASE_URL:?DATABASE_URL must be set}"

# Default migrations directory if not provided
: "${DBMATE_MIGRATIONS_DIR:=../db/migrations}"

# For local Docker Postgres without SSL, ensure sslmode=disable when connecting to localhost
EFFECTIVE_DATABASE_URL="$DATABASE_URL"
if printf '%s' "$EFFECTIVE_DATABASE_URL" | grep -qE '(localhost|127\.0\.0\.1|0\.0\.0\.0)'; then
  if ! printf '%s' "$EFFECTIVE_DATABASE_URL" | grep -q 'sslmode='; then
    if printf '%s' "$EFFECTIVE_DATABASE_URL" | grep -q '\?'; then
      EFFECTIVE_DATABASE_URL="${EFFECTIVE_DATABASE_URL}&sslmode=disable"
    else
      EFFECTIVE_DATABASE_URL="${EFFECTIVE_DATABASE_URL}?sslmode=disable"
    fi
  fi
  export PGSSLMODE=disable
fi

# Run pending migrations and wait for DB to be ready
DATABASE_URL="$EFFECTIVE_DATABASE_URL" dbmate --migrations-dir "$DBMATE_MIGRATIONS_DIR" --wait up
