# Dockerfile

# --- Stage 1: Build the React Frontend ---
# Use a specific, slim Node.js version for reproducibility
FROM node:20-slim as frontend-builder
WORKDIR /app
# Copy only the package files first to leverage Docker's layer caching
COPY frontsorter/package.json frontsorter/package-lock.json ./frontsorter/
RUN cd frontsorter && npm install
# Copy the rest of the frontend source code
COPY frontsorter/ ./frontsorter/
# Build the static assets for production
RUN cd frontsorter && npm run build

# --- Stage 2: Build the Rust Backend ---
FROM rust:1.85 as rust-builder
WORKDIR /app
# Optionally prime cache using Cargo.toml/Cargo.lock first (simple path here)
COPY database/sql ./database/sql
COPY rustsorter/ ./rustsorter/
RUN cd rustsorter && cargo build --release --bin rustsorter

# --- Stage 3: Create the final, small runtime image ---
FROM debian:bookworm-slim as runtime
WORKDIR /app
# Install OpenSSL, a common runtime dependency for Rust web apps using TLS
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy the compiled Rust binary from the builder stage
COPY --from=rust-builder /app/rustsorter/target/release/rustsorter .

# Copy the built React assets from the frontend stage into a `public` directory
# Your Rust app will need to be configured to serve these files.
COPY --from=frontend-builder /app/frontsorter/dist ./frontsorter/public

# This build argument will be used to pass the database URL during deployment.
ARG DATABASE_URL_ARG
ENV DATABASE_URL=$DATABASE_URL_ARG

# Expose the port your Rust application listens on
EXPOSE 8081

# The command to run when the container starts
CMD ["./rustsorter"]
