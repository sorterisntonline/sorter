# run-postgres.sh
set -e
HOST_PORT=5432
NAME=postgres-dev
DOCKER_REPO=postgres
TAG=14.1

# Stop and remove existing container if it exists
if docker ps -a | grep -q $NAME; then
    echo "Stopping existing container..."
    docker stop $NAME || true
    echo "Removing existing container..."
    docker rm $NAME || true
fi

# Check if the image exists locally
if ! docker images ${DOCKER_REPO}:${TAG} | grep -q ${TAG}; then
    echo "PostgreSQL image not found locally. Pulling ${DOCKER_REPO}:${TAG}..."
    docker pull ${DOCKER_REPO}:${TAG}
fi

echo "Starting PostgreSQL container..."

# Determine if we should run in background or foreground
DETACH_FLAG=""
if [ "$DETACH" = "true" ]; then
    echo "Starting container in background..."
    DETACH_FLAG="-d"
else
    echo "Starting container in foreground..."
    DETACH_FLAG="--rm"
fi

# Start container
docker run $DETACH_FLAG --name $NAME \
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
    -c 'hba_file=/etc/postgresql/pg_hba.conf'