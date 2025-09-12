#!/bin/bash
set -e

# ==============================================================================
# Sorter DB run command - Rewritten by Gemini
# ==============================================================================


# --- Configuration ---
HOST_PORT=5432
NAME=postgres-dev
DOCKER_REPO=postgres
TAG=14.1
PG_DATA_DIR="`pwd`/pgdata"

# --- Script Logic ---

# Check for a reset flag (e.g., ./run-postgres.sh --reset)
# This part remains the same.
if [ "$1" == "--reset" ]; then
    read -p "Are you sure you want to permanently delete all local database data? [y/N] " response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Stopping and removing existing container if it exists..."
        docker stop $NAME || true
        docker rm $NAME || true > /dev/null 2>&1 || true

        echo "Deleting database data directory: ${PG_DATA_DIR}"
        # Try without sudo first
        if rm -rf "$PG_DATA_DIR" 2>/dev/null; then
            echo "Removed data directory without sudo."
        else
            echo "Elevated permissions required to remove data directory."
            sudo rm -rf "$PG_DATA_DIR"
        fi
        echo "Database has been reset. You can now start it normally."
    else
        echo "Reset cancelled."
    fi
    # Exit after resetting, as it's a separate action.
    exit 0
fi

# Stop and remove any previous container with the same name to avoid conflicts
if docker ps -a | grep -q $NAME; then
    echo "Stopping and removing existing container..."
    docker stop $NAME || true
    # The --rm flag on the previous run should have removed it, but this is a safeguard.
    docker rm $NAME > /dev/null 2>&1 || true
fi

echo "Starting PostgreSQL container in foreground..."
echo "PostgreSQL logs will be shown below. Press Ctrl-C to stop."

# Create the data directory if it doesn't exist
mkdir -p "$PG_DATA_DIR"

# Construct local DB URL and write config.edn
DB_URL="postgres://postgres:password@localhost:${HOST_PORT}/postgres"
echo "{:jdbc-url \"${DB_URL}\"}" > config.edn

# Also write DATABASE_URL to rustsorter/.env.local for migrate.sh convenience
ENV_FILE="../rustsorter/.env.local"
mkdir -p "$(dirname "$ENV_FILE")"
if ! ( [ -f "$ENV_FILE" ] && grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null ); then
  echo "DATABASE_URL=${DB_URL}" >> "$ENV_FILE"
fi

# Provide DBMATE_MIGRATIONS_DIR if missing (relative to rustsorter/)
if ! grep -q '^DBMATE_MIGRATIONS_DIR=' "$ENV_FILE" 2>/dev/null; then
  echo 'DBMATE_MIGRATIONS_DIR=../db/migrations' >> "$ENV_FILE"
fi

if grep -q '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null; then
  echo "Local DATABASE_URL present in $ENV_FILE"
else
  echo "Set local DATABASE_URL in $ENV_FILE"
fi

# --- MODIFIED DOCKER COMMAND ---
# The '-d' (detached) flag has been REMOVED.
# This makes the container run in the foreground.
docker run --rm --name $NAME \
    --volume "${PG_DATA_DIR}:/var/lib/postgresql/data" \
    --volume "`pwd`/pg_hba.conf:/etc/postgresql/pg_hba.conf" \
    --volume "`pwd`/postgresql.conf:/etc/postgresql/postgresql.conf" \
    -e POSTGRES_PASSWORD=password \
    -e POSTGRES_USER=postgres \
    -e PGDATA=/var/lib/postgresql/data/pgdata14 \
    -p ${HOST_PORT}:5432 \
    ${DOCKER_REPO}:${TAG} \
    postgres \
    -c 'config_file=/etc/postgresql/postgresql.conf' \
    -c 'hba_file=/etc/postgresql/pg_hba.conf'

# This script will now block on the line above until you press Ctrl-C.
# The lines below will only execute after the container has been stopped.
echo ""
echo "PostgreSQL container stopped."
