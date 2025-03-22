FROM rust:latest

WORKDIR /usr/src/app

# Install dependencies for development
RUN apt-get update && \
    apt-get install -y libpq-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set environment variables with default values
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=postgres
ENV DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
ENV NODE_ENV=development
ENV ENVIRONMENT=development

# Copy Cargo.toml and Cargo.lock for dependencies
COPY rustsorter/Cargo.toml rustsorter/Cargo.lock ./

# Create .sqlx directory if it exists in the source
COPY rustsorter/.sqlx ./.sqlx

# Copy source code only (no target directories)
COPY rustsorter/src ./src
COPY rustsorter/run.sh ./run.sh
COPY rustsorter/run_tests.sh ./run_tests.sh
COPY rustsorter/rustfmt.toml ./rustfmt.toml

# Copy entrypoint script to a location that won't be overridden by volume mounts
COPY docker/rustsorter/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set up cargo to use offline mode if needed
ENV SQLX_OFFLINE=true

# Expose port 8081
EXPOSE 8081

# Use the entrypoint script with absolute path
ENTRYPOINT ["/entrypoint.sh"] 