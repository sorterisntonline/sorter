#!/usr/bin/env bash
set -euo pipefail

# Load env from .env if present (repo root)
if [ -f .env ]; then
  set -a; . ./.env; set +a
fi

# Ensure DATABASE_URL is set for dbmate
: "${DATABASE_URL:?DATABASE_URL must be set}"

# Repo-standard migrations directory
MIGRATIONS_DIR="db/migrations"

# Run pending migrations and wait for DB to be ready (disable SSL for dbmate only)
PGSSLMODE=disable DATABASE_URL="$DATABASE_URL" dbmate --migrations-dir "$MIGRATIONS_DIR" --wait up

