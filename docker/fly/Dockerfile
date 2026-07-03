# Stage 1: build frontend assets into borter/resources/public
FROM node:20-bookworm-slim AS forter-build
WORKDIR /app
COPY forter/package.json forter/package-lock.json ./forter/
RUN cd forter && npm ci
COPY forter/ ./forter/
COPY borter/resources/public ./borter/resources/public/
RUN mkdir -p borter/resources/public && cd forter && ENVIRONMENT=staging npm run staging

# Stage 2: build borter uberjar
FROM zudsniper/clojure:openjdk-17-node AS borter-build
WORKDIR /app/borter
COPY borter/deps.edn borter/build.sh borter/version ./
COPY borter/src ./src/
COPY borter/src-build ./src-build/
COPY borter/resources ./resources/
COPY --from=forter-build /app/borter/resources/public ./resources/public/
RUN clojure -P && VERSION=$(cat version) && clojure -X:build uberjar :version "\"$VERSION\""

# Stage 3: build rustsorter
FROM rust:1-bookworm AS rustsorter-build
WORKDIR /app
RUN apt-get update && apt-get install -y libpq-dev pkg-config && rm -rf /var/lib/apt/lists/*
COPY rustsorter/Cargo.toml rustsorter/Cargo.lock ./
COPY rustsorter/.sqlx ./.sqlx
COPY rustsorter/src ./src
ENV SQLX_OFFLINE=true
RUN cargo build --release

# Stage 4: runtime
FROM eclipse-temurin:17-jre-jammy
RUN apt-get update && apt-get install -y supervisor curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=borter-build /app/borter/target/sorter-*-standalone.jar /app/borter/sorter.jar
COPY --from=rustsorter-build /app/target/release/rustsorter /app/rustsorter/rustsorter
COPY docker/fly/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/fly/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/borter/logs

ENV JAVA_OPTS="-Xmx256m -Xms64m"
ENV ENVIRONMENT=staging
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -f http://127.0.0.1:${PORT}/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
