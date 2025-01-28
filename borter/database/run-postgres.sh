# run-postgres.sh
set -e
HOST_PORT=5432
NAME=postgres-dev
DOCKER_REPO=postgres
TAG=14.1
PG_DUMP_DATA=$1

echo "{:jdbc-url \"postgres://postgres:password@localhost:${HOST_PORT}/postgres\"}" > config.edn

# Check if container exists and PG_DUMP_DATA is provided
if [ ! -z "$PG_DUMP_DATA" ] && docker ps -a | grep -q $NAME; then
    read -p "Container exists. Replace existing data with $PG_DUMP_DATA? [y/N] " response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Stopping existing container..."
        docker stop $NAME
    else
        echo "Keeping existing data"
        PG_DUMP_DATA=""
    fi
fi

# Start the container
docker run --rm --name $NAME \
  --volume `pwd`/pgdata:/var/lib/pgsql/data \
  --volume `pwd`/mnt_data:/mnt/data \
  --volume `pwd`/pg_hba.conf:/etc/postgresql/pg_hba.conf \
  --volume `pwd`/postgresql.conf:/etc/postgresql/postgresql.conf \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_USER=postgres \
  -e PGDATA=/var/lib/pgsql/data/pgdata14 \
  -e POSTGRES_INITDB_ARGS="--data-checksums --encoding=UTF8" \
  -e POSTGRES_DB=postgres \
  -p ${HOST_PORT}:5432 \
  ${DOCKER_REPO}:${TAG} \
  postgres \
    -c 'config_file=/etc/postgresql/postgresql.conf' \
    -c 'hba_file=/etc/postgresql/pg_hba.conf' &

# If PG_DUMP_DATA is provided, wait for PostgreSQL to start and import the data
if [ ! -z "$PG_DUMP_DATA" ]; then
    echo "Waiting for PostgreSQL to start..."
    sleep 5  # Give PostgreSQL time to start

    # Try to connect until successful or timeout
    for i in {1..30}; do
        if docker exec -e PGPASSWORD=password $NAME pg_isready -U postgres; then
            echo "PostgreSQL is ready. Importing data..."
            docker exec -i -e PGPASSWORD=password $NAME psql -U postgres -d postgres < "$PG_DUMP_DATA"
            echo "Data import completed"
            break
        fi
        sleep 1
    done
fi

# Keep the script running (remove the & from the docker run command if you don't want this)
wait
