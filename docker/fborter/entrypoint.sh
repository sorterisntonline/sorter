#!/bin/bash
set -e

# Setup borter database config
mkdir -p /app/borter/database
echo "{:jdbc-url \"postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}\"}" > /app/borter/database/config.edn

# Create borter .env file with all environment variables
cd /app/borter
cat > .env << EOF
# Environment Type
ENVIRONMENT=${ENVIRONMENT:-development}

# PostgreSQL
DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

# Hostname and Logging
HOSTNAME=${HOSTNAME:-localhost}
BORTER_LOG_PATH=${BORTER_LOG_PATH:-./logs}
BORTER_LOG_LEVEL=${BORTER_LOG_LEVEL:-debug}

# REPL
REPL_PASSWORD=${REPL_PASSWORD:-dev_password}

# Linear Integration
BORTER_LINEAR_CLIENT_ID=${BORTER_LINEAR_CLIENT_ID:-}
BORTER_LINEAR_CLIENT_SECRET=${BORTER_LINEAR_CLIENT_SECRET:-}

# Spotify Integration
BORTER_SPOTIFY_CLIENT_ID=${BORTER_SPOTIFY_CLIENT_ID:-}
BORTER_SPOTIFY_CLIENT_SECRET=${BORTER_SPOTIFY_CLIENT_SECRET:-}

# Reddit Integration
BORTER_REDDIT_CLIENT_ID=${BORTER_REDDIT_CLIENT_ID:-}
BORTER_REDDIT_SECRET=${BORTER_REDDIT_SECRET:-}

# Twitter Integration
BORTER_TWITTER_KEY=${BORTER_TWITTER_KEY:-}
BORTER_TWITTER_KEY_SECRET=${BORTER_TWITTER_KEY_SECRET:-}
BORTER_TWITTER_BEARER_TOKEN=${BORTER_TWITTER_BEARER_TOKEN:-}
BORTER_TWITTER_OAUTH_CLIENTID=${BORTER_TWITTER_OAUTH_CLIENTID:-}
BORTER_TWITTER_OAUTH_CLIENTSECRET=${BORTER_TWITTER_OAUTH_CLIENTSECRET:-}

# YouTube Integration
BORTER_YOUTUBE_API_KEY=${BORTER_YOUTUBE_API_KEY:-}
BORTER_YOUTUBE_CLIENT_ID=${BORTER_YOUTUBE_CLIENT_ID:-}
BORTER_YOUTUBE_CLIENT_SECRET=${BORTER_YOUTUBE_CLIENT_SECRET:-}
BORTER_YOUTUBE_REDIRECT_URIS=${BORTER_YOUTUBE_REDIRECT_URIS:-http://localhost:3000/auth/youtube/callback}
BORTER_YOUTUBE_JAVASCRIPT_ORIGINS=${BORTER_YOUTUBE_JAVASCRIPT_ORIGINS:-http://localhost:3000}

# Email Integration
BORTER_SENDGRID_API_KEY=${BORTER_SENDGRID_API_KEY:-}

# Admin Configuration
BORTER_STATIC_ADMINS=${BORTER_STATIC_ADMINS:-admin}
BORTER_STATIC_API_KEYS=${BORTER_STATIC_API_KEYS:-dev_api_key}

# Development Features
AUTO_LOGIN=${AUTO_LOGIN:-true}
NO_RATE_LIMITS=${NO_RATE_LIMITS:-false}
EOF

# Setup forter environment
cd /app/forter
cat > .env << EOF
# Environment Type
ENVIRONMENT=${ENVIRONMENT:-development}

# API URLs and Integration Keys
VITE_API_URL=${VITE_API_URL:-http://localhost:3000}
VITE_LINEAR_CLIENT_ID=${VITE_LINEAR_CLIENT_ID:-}
VITE_SPOTIFY_CLIENT_ID=${VITE_SPOTIFY_CLIENT_ID:-}
VITE_YOUTUBE_CLIENT_ID=${VITE_YOUTUBE_CLIENT_ID:-}
EOF

# Install forter dependencies
echo "Installing Node.js dependencies..."
npm install

# Install borter dependencies
cd /app/borter
echo "Checking Clojure dependencies..."
clojure -P

# Return to app directory
cd /app

# Start supervisor to run both applications
exec supervisord -c /etc/supervisor/conf.d/supervisord.conf 