# Base image with Java (for Clojure) and Node.js
FROM zudsniper/clojure:openjdk-17-node

WORKDIR /app

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl gnupg supervisor && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy borter project files (excluding target, tmp, and specified data dirs)
COPY borter/deps.edn ./borter/
COPY borter/src ./borter/src/
# Copy resources directory excluding public/assets
COPY borter/resources/migrations ./borter/resources/migrations/
COPY borter/resources/logback.xml ./borter/resources/logback.xml
COPY borter/resources/ai ./borter/resources/ai/
# Create public directory but don't copy assets
RUN mkdir -p ./borter/resources/public
# Copy database files excluding pgdata and mnt_data
COPY borter/database/config.edn ./borter/database/
COPY borter/database/run-postgres.sh ./borter/database/
COPY borter/database/pg_hba.conf ./borter/database/
COPY borter/database/setup-docker.sh ./borter/database/
COPY borter/database/postgresql.conf ./borter/database/
COPY borter/database/readme.tdsl ./borter/database/
COPY borter/src-build ./borter/src-build/
COPY borter/build.sh ./borter/build.sh
COPY borter/run.sh ./borter/run.sh
COPY borter/version ./borter/version

# Create necessary directories
RUN mkdir -p ./borter/logs ./borter/target

# Copy forter project files (excluding node_modules)
COPY forter/package.json forter/package-lock.json ./forter/
COPY forter/public ./forter/public/
COPY forter/src ./forter/src/
COPY forter/scripts ./forter/scripts/
COPY forter/overrides ./forter/overrides/
COPY forter/*.js forter/*.ts forter/*.html forter/*.json ./forter/

# Copy supervisor configuration
COPY docker/fborter/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy entrypoint script - ensure this isn't overridden by volume mounts
COPY docker/fborter/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports
# 3000 - Main port for web and API
# 7888 - nREPL port for Clojure development
EXPOSE 3000 7888

# Set environment variables defaults - will be overridden by docker-compose
ENV POSTGRES_USER=postgres
ENV POSTGRES_PASSWORD=password
ENV POSTGRES_DB=postgres
ENV VITE_API_URL=http://localhost:3000
ENV IS_DOCKER=true
ENV ENVIRONMENT=development

# Use the entrypoint script with absolute path
ENTRYPOINT ["/entrypoint.sh"] 