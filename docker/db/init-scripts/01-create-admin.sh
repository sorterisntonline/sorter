#!/bin/bash
set -e

echo "Starting admin user setup script..."

# Make the script more resilient by first checking if PostgreSQL is ready
for i in {1..30}; do
  echo "Checking if database is ready (attempt $i/30)..."
  if pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; then
    echo "Database is ready. Proceeding with admin user setup."
    break
  fi
  
  if [ $i -eq 30 ]; then
    echo "Error: Database not ready after 30 attempts. Exiting."
    exit 1
  fi
  
  echo "Database not ready yet. Waiting 1 second..."
  sleep 1
done

echo "Executing SQL commands to set up admin user..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Log start of script execution
    DO \$\$
    BEGIN
        RAISE NOTICE 'Starting admin user setup in database...';
    END;
    \$\$;

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
            RAISE NOTICE 'Admin user exists, updating password hash...';
            UPDATE users 
            SET password_hash = '\$2a\$11\$OtrVZGZGG9L.bWvVgYeH2uLgP3qv5O5px47XVlyJLOKjgTkiBtaji'
            WHERE user_name = 'admin';
        ELSE
            RAISE NOTICE 'Admin user does not exist, creating new admin user...';
            INSERT INTO users (user_name, email, password_hash, created_at, email_verified)
            VALUES ('admin', 'admin@sorter.social', '\$2a\$11\$OtrVZGZGG9L.bWvVgYeH2uLgP3qv5O5px47XVlyJLOKjgTkiBtaji', NOW(), true);
        END IF;
    END;
    \$\$;

    -- Verify the admin user exists
    SELECT user_name, email, password_hash, email_verified 
    FROM users 
    WHERE user_name = 'admin';
    
    -- Log successful completion
    DO \$\$
    BEGIN
        RAISE NOTICE 'Admin user setup completed successfully.';
    END;
    \$\$;
EOSQL

echo "Admin user setup completed successfully!" 