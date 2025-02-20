# run-postgres.sh
set -e
HOST_PORT=5432
NAME=postgres-dev
DOCKER_REPO=postgres
TAG=14.1
PG_DUMP_DATA=$1

echo "{:jdbc-url \"postgres://postgres:password@localhost:${HOST_PORT}/postgres\"}" > config.edn

# First, check if container exists
if docker ps -a | grep -q $NAME; then
    if [ ! -z "$PG_DUMP_DATA" ]; then
        read -p "Container exists. Replace existing data with $PG_DUMP_DATA? [y/N] " response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            echo "Stopping existing container..."
            docker stop $NAME || true
            echo "Removing existing container..."
            docker rm $NAME || true
            echo "Removing existing data directory..."
            sudo rm -rf `pwd`/pgdata/*
        else
            echo "Keeping existing data"
            PG_DUMP_DATA=""
        fi
    else
        echo "Stopping existing container..."
        docker stop $NAME || true
        echo "Removing existing container..."
        docker rm $NAME || true
    fi
fi

# If PG_DUMP_DATA is provided, wait for PostgreSQL to start and import the data
if [ ! -z "$PG_DUMP_DATA" ]; then
    # Start container in background temporarily
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

    # Stop the temporary container
    docker stop $NAME

    # Start the final container
    exec docker run --rm --name $NAME \
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
else
    # Start container in background
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
fi

# Wait for PostgreSQL to be ready before creating admin user
echo "Waiting for PostgreSQL to start..."
for i in {1..30}; do
    if docker exec -e PGPASSWORD=password $NAME pg_isready -U postgres; then
        echo "PostgreSQL is ready. Ensuring admin user exists..."
        docker exec -i -e PGPASSWORD=password $NAME psql -U postgres -d postgres << EOF
-- First delete existing admin user
DELETE FROM users WHERE user_name = 'admin';

-- Then insert with our known working hash and new fields
INSERT INTO users (user_name, email, password_hash, created_at, email_verified)
SELECT 'admin', 'admin@sorter.social', '\$2a\$11\$OtrVZGZGG9L.bWvVgYeH2uLgP3qv5O5px47XVlyJLOKjgTkiBtaji', NOW(), true;

-- Verify the insert
SELECT user_name, email, password_hash, email_verified FROM users WHERE user_name = 'admin';
EOF
        break
    fi
    sleep 1
done

# Keep the script running
wait
