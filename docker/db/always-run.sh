#!/bin/bash
set -e

echo "[always-run] Waiting for PostgreSQL to be fully available..."
# Wait for PostgreSQL to be ready
for i in {1..30}; do
  echo "[always-run] Checking if database is ready (attempt $i/30)..."
  if pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; then
    echo "[always-run] Database is ready. Proceeding with admin user setup."
    break
  fi
  
  if [ $i -eq 30 ]; then
    echo "[always-run] Error: Database not ready after 30 attempts. Exiting."
    exit 1
  fi
  
  echo "[always-run] Database not ready yet. Waiting 2 seconds..."
  sleep 2
done

echo "[always-run] Executing SQL commands to ensure admin user exists..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create the users table if it doesn't exist
    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(255) NOT NULL UNIQUE,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        email_verified BOOLEAN DEFAULT FALSE
    );

    -- Insert admin user if it doesn't exist, or update password hash if it does
    DO \$\$
    DECLARE
        admin_exists BOOLEAN;
    BEGIN
        SELECT EXISTS(SELECT 1 FROM users WHERE user_name = 'admin') INTO admin_exists;
        
        IF admin_exists THEN
            RAISE NOTICE '[always-run] Admin user exists, updating password hash...';
            UPDATE users 
            SET password_hash = '\$2a\$11\$OtrVZGZGG9L.bWvVgYeH2uLgP3qv5O5px47XVlyJLOKjgTkiBtaji'
            WHERE user_name = 'admin';
        ELSE
            RAISE NOTICE '[always-run] Admin user does not exist, creating new admin user...';
            INSERT INTO users (user_name, email, password_hash, created_at, email_verified)
            VALUES ('admin', 'admin@sorter.social', '\$2a\$11\$OtrVZGZGG9L.bWvVgYeH2uLgP3qv5O5px47XVlyJLOKjgTkiBtaji', NOW(), true);
        END IF;
    END;
    \$\$;

    -- Log successful completion
    DO \$\$
    BEGIN
        RAISE NOTICE '[always-run] Admin user setup completed successfully.';
    END;
    \$\$;
EOSQL

echo "[always-run] Admin user verification complete!"

# Exit the script - let PostgreSQL continue running
exit 0 