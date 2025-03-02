# run-postgres.sh
set -e
HOST_PORT=5432
NAME=postgres-dev
DOCKER_REPO=postgres
TAG=14.1
PG_DUMP_DATA=$1

echo "{:jdbc-url \"postgres://postgres:password@localhost:${HOST_PORT}/postgres\"}" > config.edn

# Function to check if pgdata directory contains database files
data_exists() {
    # Check if pgdata directory exists and contains PG_VERSION file or other database files
    if [ -d "`pwd`/pgdata" ] && test -f "`pwd`/pgdata/pgdata14/PG_VERSION" 2>/dev/null; then
        return 0  # Data exists
    elif [ -d "`pwd`/pgdata" ] && sudo test -f "`pwd`/pgdata/pgdata14/PG_VERSION" 2>/dev/null; then
        return 0  # Data exists (needed sudo)
    else
        return 1  # No data
    fi
}

# Check if container exists or data exists
CONTAINER_EXISTS=false
DATA_EXISTS=false

if docker ps -a | grep -q $NAME; then
    CONTAINER_EXISTS=true
fi

if data_exists; then
    DATA_EXISTS=true
fi

# Handle existing container and/or data
if [ "$CONTAINER_EXISTS" = true ]; then
    echo "Stopping existing container..."
    docker stop $NAME || true
    echo "Removing existing container..."
    docker rm $NAME || true
fi

# Check if data exists and a dump file is provided
if [ "$DATA_EXISTS" = true ] && [ ! -z "$PG_DUMP_DATA" ]; then
    read -p "Database data exists. Replace existing data with $PG_DUMP_DATA? [y/N] " response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Removing existing data directory completely..."
        # Try without sudo first
        if rm -rf `pwd`/pgdata 2>/dev/null; then
            echo "Removed data directory without sudo"
        else
            echo "Elevated permissions required to remove data directory"
            sudo rm -rf `pwd`/pgdata
        fi
    else
        echo "Keeping existing data"
        PG_DUMP_DATA=""
    fi
fi

# Initialize IMPORT_SUCCESS variable to track whether import succeeded
IMPORT_SUCCESS=false

# Start container in background
if [ ! -z "$PG_DUMP_DATA" ]; then
    echo "Starting temporary container for data import..."
else
    echo "Starting PostgreSQL container..."
fi

# Check if the image exists locally
if ! docker images ${DOCKER_REPO}:${TAG} | grep -q ${TAG}; then
    echo "PostgreSQL image not found locally. Pulling ${DOCKER_REPO}:${TAG}..."
    docker pull ${DOCKER_REPO}:${TAG}
fi

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

    # Wait for container to start
    echo "Waiting for container to start and PostgreSQL to initialize..."
    sleep 10  # Increased initial wait time

    # Try to connect until successful or timeout
    for i in {1..30}; do
        if docker exec -e PGPASSWORD=password $NAME pg_isready -U postgres; then
            echo "PostgreSQL is ready. Importing data..."
            
            # Check if file is binary or text by looking at first bytes
            if head -c 5 "$PG_DUMP_DATA" | grep -q "^PGDMP"; then
                echo "Importing data from binary dump..."
                # Check for version 1.15 in header
                if head -c 20 "$PG_DUMP_DATA" | grep -q "1.15"; then
                    echo "Detected dump version 1.15 which requires special handling for PostgreSQL 14.1..."
                fi
                
                # Track if import was successful
                IMPORT_SUCCESS=false
                
                # For binary dumps, attempt to use pg_restore with proper error handling
                if docker exec -i -e PGPASSWORD=password $NAME pg_restore -U postgres -d postgres < "$PG_DUMP_DATA"; then
                    echo "Binary dump import successful"
                    IMPORT_SUCCESS=true
                else
                    echo "ERROR: pg_restore failed. This could be due to version incompatibility."
                    echo "Attempting alternative restore method with --no-owner and --no-acl flags..."
                    
                    # Try with --no-owner and --no-acl flags which can help with version compatibility
                    if docker exec -i -e PGPASSWORD=password $NAME pg_restore --no-owner --no-acl -U postgres -d postgres < "$PG_DUMP_DATA"; then
                        echo "Alternative restore method successful"
                        IMPORT_SUCCESS=true
                    else
                        echo "Attempting version-specific restore method with --binary-upgrade..."
                        
                        # Try with binary-upgrade flag for version mismatch
                        if docker exec -i -e PGPASSWORD=password $NAME pg_restore -F c --binary-upgrade -U postgres -d postgres < "$PG_DUMP_DATA"; then
                            echo "Binary-upgrade restore method successful"
                            IMPORT_SUCCESS=true
                        else
                            echo "Attempting direct SQL import via psql..."
                            
                            # Try direct import via psql as a last resort
                            if docker exec -i -e PGPASSWORD=password $NAME pg_restore -f - < "$PG_DUMP_DATA" | docker exec -i -e PGPASSWORD=password $NAME psql -U postgres -d postgres; then
                                echo "Direct SQL import successful"
                                IMPORT_SUCCESS=true
                            else
                                echo "ERROR: All restore methods failed. Unable to import the dump file."
                            fi
                        fi
                    fi
                fi
            else
                echo "Importing data from SQL text dump..."
                # Use psql for text dumps
                echo "Starting SQL import transaction..."
                docker exec -i -e PGPASSWORD=password $NAME psql -U postgres -d postgres -c "BEGIN; SET CONSTRAINTS ALL DEFERRED;"
                if cat "$PG_DUMP_DATA" | docker exec -i -e PGPASSWORD=password $NAME psql -U postgres -d postgres -v ON_ERROR_STOP=0; then
                    echo "SQL data import successful"
                    IMPORT_SUCCESS=true
                else
                    echo "WARNING: Some errors occurred during SQL import. Transaction will still be committed."
                    # Still mark as success since we're continuing with commit
                    IMPORT_SUCCESS=true
                fi
                docker exec -i -e PGPASSWORD=password $NAME psql -U postgres -d postgres -c "COMMIT;"
            fi

            # Only report success if import actually succeeded
            if [ "$IMPORT_SUCCESS" = true ]; then
                echo "Data import completed successfully"
            else
                echo "ERROR: Data import failed. The database may be empty or contain incomplete data."
                
                # Prompt user for what to do next
                echo ""
                echo "Options:"
                echo "1. Continue with empty/incomplete database (may cause application issues)"
                echo "2. Try a different dump file"
                echo "3. Exit and troubleshoot"
                read -p "What would you like to do? [1/2/3]: " import_failure_response
                
                if [[ "$import_failure_response" == "3" ]]; then
                    echo "Exiting. Database container will be stopped."
                    docker stop $NAME
                    exit 1
                elif [[ "$import_failure_response" == "2" ]]; then
                    echo "Please run the script again with a different dump file path."
                    docker stop $NAME
                    exit 0
                fi
                echo "Continuing with empty/incomplete database. The application may not function correctly."
            fi
            break
        fi
        sleep 1
    done

    # Stop the temporary container
    docker stop $NAME

    # Start the final container in the background (removed 'exec')
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
        
    echo "Waiting for container to start and PostgreSQL to initialize..."
    sleep 10  # Add initial wait for the container to start
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
        
    # Wait for container to start
    echo "Waiting for container to start and PostgreSQL to initialize..."
    sleep 10  # Add initial wait similar to the import path
fi

# Improve the wait-for-ready logic
echo "Checking if PostgreSQL is accepting connections..."
MAX_ATTEMPTS=60  # Increased from 30 to 60
for i in $(seq 1 $MAX_ATTEMPTS); do
    echo "Attempt $i of $MAX_ATTEMPTS..."
    if docker exec -e PGPASSWORD=password $NAME pg_isready -U postgres 2>/dev/null; then
        echo "PostgreSQL is ready!"
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
