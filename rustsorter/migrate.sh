#!/usr/bin/env bash
set -euo pipefail

# Ensure DATABASE_URL is set for dbmate
: "${DATABASE_URL:?DATABASE_URL must be set}"

# Default migrations directory if not provided
: "${DBMATE_MIGRATIONS_DIR:=../db/migrations}"

# Run pending migrations and wait for DB to be ready
dbmate --migrations-dir "$DBMATE_MIGRATIONS_DIR" --wait up
