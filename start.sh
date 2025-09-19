#!/bin/bash
echo "🚀 Starting Sorter development environment with Supervisord..."

# Stop any previous Docker container
docker stop postgres-dev > /dev/null 2>&1 || true

# Create logs directory if it doesn't exist
mkdir -p logs

# Create .env file with database URL if it doesn't exist
if [ ! -f .env ]; then
    echo "DATABASE_URL=postgres://postgres:password@localhost:5438/postgres?sslmode=disable" > .env
fi

# Start supervisord with our local config
uv run supervisord -c supervisord.conf
