#!/bin/sh
set -eu
echo "[entrypoint] starting container at $(date)"
echo "[entrypoint] pwd=$(pwd)"
echo "[entrypoint] ls -l:" && ls -l
echo "[entrypoint] uname -a:" && uname -a || true
echo "[entrypoint] env (redacting DATABASE_URL):"
env | sed 's/^DATABASE_URL=.*/DATABASE_URL=REDACTED/'

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL not set" >&2
  exit 1
fi

echo "[entrypoint] launching ./rustsorter"
exec ./rustsorter


