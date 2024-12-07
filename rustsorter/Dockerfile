FROM rust:latest

WORKDIR /usr/src/app

# Set build arguments with default values
ARG POSTGRES_USER=postgres
ARG POSTGRES_PASSWORD=your_secure_password
ARG POSTGRES_DB=db

# Set environment variables for build-time and runtime
ENV DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

# Copy Cargo.toml and Cargo.lock
COPY Cargo.toml Cargo.lock ./

# Fetch dependencies
#RUN cargo fetch

# Copy source code
COPY src ./src
COPY static ./static

# sqlx: Copy .sqlx queries, force offline compile
COPY .sqlx ./.sqlx
ENV SQLX_OFFLINE=true

# Build the application
RUN cargo build --release

# Expose port 8080
EXPOSE 8080

# Set runtime environment variables
ENV DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

# Run the application
CMD ["./target/release/rustsorter"]
