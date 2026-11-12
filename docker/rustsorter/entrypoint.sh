#!/bin/bash
set -e

# Set environment variables
export DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
export ENVIRONMENT=${ENVIRONMENT:-development}

# Create .env file for development
cat > .env << EOF
# Environment settings
ENVIRONMENT=${ENVIRONMENT}
DATABASE_URL=${DATABASE_URL}
EOF

if [ ! -z "$DISCORD_TOKEN" ]; then
  echo "DISCORD_TOKEN=${DISCORD_TOKEN}" >> .env
fi

# Determine build profile based on environment
if [ "$ENVIRONMENT" = "production" ] || [ "$NODE_ENV" = "production" ]; then
  echo "Building rustsorter in production mode..."
  cargo build --release
  BINARY_PATH="./target/release/rustsorter"
else
  echo "Building rustsorter in development mode (${ENVIRONMENT})..."
  cargo build
  BINARY_PATH="./target/debug/rustsorter"
fi

# Start the application
echo "Starting rustsorter..."
exec $BINARY_PATH 