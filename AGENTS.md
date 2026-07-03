# AGENTS.md - Sorter Development Guide

## Overview

Sorter is a **Rust and React based pair-wise staunchly democratic social media application**. The project consists of:

- **Backend**: Rust server (`rustsorter/`) using Axum web framework
- **Frontend**: React client (`frontsorter/`) using Vite, TypeScript, and TailwindCSS
- **Database**: PostgreSQL with migrations managed by dbmate
- **Orchestrator**: Python-based `main.py` script for unified project management

## Quick Start Commands

### Essential Commands (via main.py orchestrator)

```bash
# First-time setup for newcomers
uv --version                   # Check UV is installed (if not: curl -LsSf https://astral.sh/uv/install.sh | sh)

# Start everything (one command to rule them all!)
uv run main.py start           # Launch all services with supervisord

# Environment setup
uv run main.py setup           # Setup development environment and check dependencies

# Process management (AI-powered with MCP integration!)
uv run main.py list            # List all processes
uv run main.py status          # Get status of all processes
uv run main.py status postgres # Get status of specific process
uv run main.py start-process rust-server  # Start specific process
uv run main.py stop rust-server           # Stop specific process
uv run main.py restart rust-server        # Restart specific process
uv run main.py logs rust-server           # View process logs
uv run main.py logs rust-server --lines 50 # View last 50 lines

# Database operations
uv run main.py migrate         # Run database migrations

# Development and testing
uv run main.py test            # Run all tests (Rust + Python)
uv run main.py build           # Build entire project
uv run main.py dev-server      # Start only Rust backend
uv run main.py dev-client      # Start only React frontend

# System management
uv run main.py reload          # Reload supervisord configuration
uv run main.py info            # Get system information
```

### Alternative console script (after installation)

```bash
# If you prefer shorter commands, install as package:
uv sync                        # Install dependencies
uv run sorter start           # Use 'sorter' instead of 'main.py'
uv run sorter --help          # Show all available commands
```

### Direct MCP Integration for AI Agents

AI agents can use MCP supervisord tools directly:
- `mcp__supervisord__list_processes`
- `mcp__supervisord__get_process_status`  
- `mcp__supervisord__start_process`
- `mcp__supervisord__stop_process`
- `mcp__supervisord__restart_process`
- `mcp__supervisord__get_logs`

## Project Structure

```
sorter/
├── database/
│   └── sql/                 # Database migrations and schema
├── rustsorter/              # Rust backend server
│   └── src/                 # Rust source code
├── frontsorter/             # React frontend client
│   └── src/                 # React source code
├── test/                    # Python integration tests
├── .github/                 # GitHub Actions CI/CD
├── main.py                  # Python orchestrator script (single entry point)
├── supervisord.conf         # Process management configuration
└── pgdata/                  # PostgreSQL data directory (local dev)
```

## Key Technologies

### Backend (rustsorter/)
- **Framework**: Axum (async web framework)
- **Database**: SQLx (PostgreSQL async driver)
- **Authentication**: bcrypt for password hashing
- **API Documentation**: aide (OpenAPI/Swagger)
- **WebSockets**: Built-in Axum WebSocket support
- **Ranking**: ELO rating system

### Frontend (frontsorter/)
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 6
- **Styling**: TailwindCSS 4
- **Routing**: React Router 7
- **Forms**: React Hook Form with Zod validation
- **State Management**: TanStack Query (React Query)
- **Icons**: React Icons

### Database & DevOps
- **Database**: PostgreSQL with Docker
- **Migrations**: dbmate
- **Testing**: pytest (Python integration tests)
- **Process Management**: supervisord with supervisord-mcp for AI integration
- **Orchestration**: Python script with UV dependency management

## Development Workflow

1. **First time setup**:
   ```bash
   uv run main.py setup       # Check dependencies and setup environment
   ```

2. **Daily development** (single terminal!):
   ```bash
   uv run main.py start       # Starts all services: PostgreSQL, Rust backend, React frontend
   ```

3. **Individual process management**:
   ```bash
   uv run main.py logs rust-server    # Check backend logs
   uv run main.py restart postgres    # Restart database
   uv run main.py stop vite-client   # Stop frontend only
   ```

4. **Database changes**:
   ```bash
   # After adding new migrations
   uv run main.py migrate
   
   # IMPORTANT: After modifying database schema or SQL queries
   uv run main.py sqlx-prepare
   # This generates .sqlx files needed for CI/CD offline compilation
   # Always commit these files along with your schema changes
   ```

5. **Testing**:
   ```bash
   # Run all tests (will start services if needed)
   uv run main.py test
   
   # Or run individually
   cd rustsorter && cargo test           # Rust unit tests only
   cd test && python -m pytest          # Python integration tests only
   ```

## Environment Variables

The project uses a `.env` file in the root directory (created automatically by setup):
```bash
DATABASE_URL=postgres://postgres:password@localhost:5438/postgres?sslmode=disable
```

## Build & Deployment

### Continuous Integration

The project uses GitHub Actions for automated testing and deployment:

- **CI Pipeline** (`.github/workflows/ci.yml`):
  - Runs on all pushes and pull requests
  - Tests Rust backend with PostgreSQL service
  - Runs Python integration tests
  - Uses cargo-nextest for fast parallel testing
  - Generates JUnit reports for test results

### Preview Deployments

Every pull request automatically gets a **full preview deployment** via `.github/workflows/deploy-preview.yml`:

1. **Database Branch**: Creates isolated Neon PostgreSQL branch for each PR
2. **Migrations**: Runs database migrations against the new branch  
3. **App Deploy**: Deploys to unique Fly.io app (e.g. `pr-123-sorter`)
4. **Data Seeding**: Seeds database with TF2 dataset using Babashka/Clojure scripts
5. **Health Check**: Waits for `/api/health` endpoint to respond
6. **URL Generation**: Comments preview URL on the PR
7. **Cleanup**: Automatically destroys resources when PR is closed

### Production Deployment

- **Staging**: Auto-deploys from `staging` branch to staging environment
- **Production**: Auto-deploys from `production` branch to production
- **Platform**: Fly.io for app hosting, Neon for PostgreSQL
- **Docker**: Uses `Dockerfile` in root for containerized deployment

## Troubleshooting

### Common Issues

1. **Database connection issues**: Use `uv run main.py logs postgres` to check database logs
2. **Missing dependencies**: Run `uv run main.py setup` to check and install dependencies
3. **Port conflicts**: Check `uv run main.py status` to see which processes are running
4. **Process not starting**: Use `uv run main.py logs <process-name>` to see error logs

### Development Tips

- **Single entry point**: Use `main.py` for all operations - no need for multiple scripts
- **Process monitoring**: Use `uv run main.py list` to see all running services
- **Hot reload**: Both Rust (with cargo-watch) and React (with Vite) support hot reload
- **Log aggregation**: All logs are centralized in `./logs/` directory
- **PostgreSQL persistence**: Database data persists in `pgdata/` directory
- **AI-friendly**: The orchestrator is designed for easy AI agent interaction

### Migration from Old Scripts

If you're coming from the old script-based workflow:
- `./start.sh` → `uv run main.py start`
- `./ctl.sh list` → `uv run main.py list`
- `./dbmate.sh up` → `uv run main.py migrate`
- `sorter-db run-server` → `uv run main.py dev-server`
- `sorter-db run-client` → `uv run main.py dev-client`

## Contributing

See individual component READMEs and the main project contributors for specific development guidelines. The project tracks development time via Wakatime badges for key contributors.

### For AI Agents

This project is optimized for AI agent interaction:
- Single Python entry point (`main.py`) with clear command structure
- MCP integration for process management
- Comprehensive logging and status reporting
- Dependency checking and environment setup
- All operations accessible through simple commands

## Cursor Cloud specific instructions

The `uv run main.py ...` / `supervisord` orchestrator described above does **not exist in this repo** (`main.py` and `supervisord.conf` are missing; `start.sh` only calls the missing `main.py`). Use the manual commands in `dev-commands.md` — that file is the source of truth for running the stack. CI workflows are also disabled (`.github/workflows/*.disabled`).

Toolchain/deps are pre-installed by the startup update script (`uv sync --extra test`, `npm install --prefix frontsorter`) plus the VM snapshot (Rust nightly per `rust-toolchain.toml`, `uv`, `dbmate`, native PostgreSQL 16, `libssl-dev`). Do not add service startup, migrations, or builds to the update script.

**Services** (run each; see `dev-commands.md` for exact commands):
- **PostgreSQL** runs **natively** (not Docker) on **port 5439** with data dir `~/sorter-pgdata`. Start it with `/usr/lib/postgresql/16/bin/pg_ctl -D ~/sorter-pgdata -l ~/sorter-pgdata.log start` (socket dir is `~/pgsock`, configured in `postgresql.conf`). It is not auto-started on VM boot, so start it before the backend/tests.
- **Rust backend** (`rustsorter/`) on port **8081**: requires `DATABASE_URL=postgres://postgres:password@localhost:5439/postgres?sslmode=disable`; run `cargo run` from `rustsorter/`. Exits immediately if `DATABASE_URL` is unset.
- **React frontend** (`frontsorter/`) on port **5173**: `npm run dev`; it proxies `/api` → `127.0.0.1:8081`.

**Migrations** live in `./db/migrations` (NOT `database/sql`): `dbmate --migrations-dir ./db/migrations up` with `PGSSLMODE=disable` and the `DATABASE_URL` above.

**Auth for local testing:** the only real login is Spotify OAuth (needs external creds), so browser login is unavailable by default. Two workarounds:
- API calls: send header `Authorization: Bearer STATIC_TEST_KEY_FOR_ADMIN_USER_123` (maps to the seeded `admin` user).
- Authenticated SPA/browser session: insert a `user_sessions` row (`session_type='full'`, future `expires_at`) for the `admin` user, then set the browser cookie `session_id=<that uuid>` on `localhost:5173`. This is required for UI write actions (e.g. Create Entity), which otherwise return 401.

**API quirk:** the ranking GET endpoint is nested, so it lives at `/api/rank/rank?ns=<parent_ns>&pk=<parent_pk>` (not `/api/rank`). The `POST /api/rank/` variant ranks a posted list of children.

Tests: Rust `cd rustsorter && cargo test` (needs DB + `DATABASE_URL`); Python integration `cd test && uv run --extra test python -m pytest` (needs the backend running on 8081). Frontend lint: `npm run lint --prefix frontsorter`.
