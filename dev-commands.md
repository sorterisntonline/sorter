# Development Commands

This file replaces `supervisord` and `main.py` with simple commands that can be run directly or via Claude Code.

## Prerequisites

- Docker (for PostgreSQL)
- Rust/Cargo
- Node.js/npm
- dbmate (for migrations)

## Database Setup

### Start PostgreSQL

```bash
docker run -d --name postgres-dev \
  -v $(pwd)/pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_USER=postgres \
  -p 5439:5432 \
  postgres:15
```

### Stop PostgreSQL

```bash
docker stop postgres-dev
```

### Remove PostgreSQL container

```bash
docker stop postgres-dev && docker rm postgres-dev
```

## Database Migrations

### Run migrations

```bash
export PGSSLMODE=disable
export DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable
dbmate --migrations-dir ./db/migrations up
```

### Create new migration

```bash
export PGSSLMODE=disable
export DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable
dbmate --migrations-dir ./db/migrations new migration_name
```

## Development Servers

### Start Rust backend (in one terminal)

```bash
cd rustsorter
export RUST_LOG=debug
export DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable
cargo run
```

### Start React frontend (in another terminal)

```bash
cd frontsorter
npm run dev
```

## Testing

### Run Rust tests

```bash
cd rustsorter
export DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable
cargo test
```

### Run with logging

```bash
cd rustsorter
export RUST_LOG=info
export DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable
cargo test
```

## Building

### Build Rust backend

```bash
cd rustsorter
cargo build
```

### Build Rust backend (release mode)

```bash
cd rustsorter
cargo build --release
```

### Build React frontend

```bash
cd frontsorter
npm run build
```

### Generate TypeScript types from Rust

```bash
cd rustsorter
cargo test generate_typescript_bindings -- --nocapture
```

## SQLx Maintenance

### Prepare SQLx offline mode

```bash
cd rustsorter
export PGSSLMODE=disable
export DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable
cargo sqlx prepare
```

## Quick Start (Full Stack)

1. **Start database:**
   ```bash
   docker run -d --name postgres-dev -v $(pwd)/pgdata:/var/lib/postgresql/data -e POSTGRES_PASSWORD=password -e POSTGRES_USER=postgres -p 5439:5432 postgres:15
   ```

2. **Run migrations:**
   ```bash
   export PGSSLMODE=disable && export DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable && dbmate --migrations-dir ./db/migrations up
   ```

3. **Start backend (terminal 1):**
   ```bash
   cd rustsorter && export RUST_LOG=debug && export DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable && cargo run
   ```

4. **Start frontend (terminal 2):**
   ```bash
   cd frontsorter && npm run dev
   ```

## Claude Code Integration

Claude Code can manage these processes natively:
- Use `run_in_background: true` for long-running processes
- Monitor logs with `BashOutput` tool
- Kill processes with `KillShell` tool

No need for supervisord or process orchestration tools!
