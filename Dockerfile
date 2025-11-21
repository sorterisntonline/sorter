# Dockerfile

# --- Stage 1: Build the Rust Backend ---
FROM rust:1.85 as rust-builder
WORKDIR /app
COPY database/sql ./database/sql
COPY rustsorter/ ./rustsorter/
RUN cd rustsorter && cargo build --release --bin rustsorter

# --- Stage 2: Create the final, small runtime image ---
FROM debian:bookworm-slim as runtime
WORKDIR /app
# Install OpenSSL and CA certificates for TLS
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled Rust binary from the builder stage
COPY --from=rust-builder /app/rustsorter/target/release/rustsorter .

# Copy static files
COPY static ./static

# Set environment variable so Rust app knows where to serve static files
ENV STATIC_DIR=/app/static

# Expose the port your Rust application listens on
EXPOSE 8081

# The command to run when the container starts
CMD ["./rustsorter"]
