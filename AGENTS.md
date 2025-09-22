# AGENTS.md - Sorter Development Guide

## Overview

Sorter is a **Rust and React based pair-wise staunchly democratic social media application**. The project consists of:

- **Backend**: Rust server (`rustsorter/`) using Axum web framework with OpenAPI support
- **Frontend**: React client (`frontsorter/`) using Vite, TypeScript, and TailwindCSS with auto-generated types
- **Database**: PostgreSQL with migrations managed by dbmate
- **CLI Tool**: Custom `sorter-db` CLI for project management
- **Type Safety**: Automatic TypeScript type generation from Rust backend OpenAPI specification

## Quick Start Commands

### Essential Commands (via UV + supervisord-mcp)

```bash
# First-time setup for newcomers
uv --version                   # Check UV is installed (if not: curl -LsSf https://astral.sh/uv/install.sh | sh)
uv add supervisord-mcp         # Add the MCP server (if not already added)

# Start everything
./start.sh                     # Launch all services with supervisord

# Process management (AI-powered with MCP integration!)
# Use MCP supervisord tools directly in your AI agent:
# - mcp__supervisord__list_processes
# - mcp__supervisord__get_process_status  
# - mcp__supervisord__start_process
# - mcp__supervisord__stop_process
# - mcp__supervisord__restart_process
# - mcp__supervisord__get_logs

# Debugging
./debug.sh                     # Quick debug overview

# Database migrations via MCP
# Use mcp__supervisord__start_process with name="migrations"
```

### Legacy Commands (sorter-db CLI - still available)

The TypeScript CLI is still available but we recommend the UV + supervisord-mcp approach above:

```bash
cd database/cli && npm install -g . && cd -
sorter-db setup
sorter-db run-postgres
sorter-db run-server
sorter-db run-client
```

### Alternative Manual Commands (if needed)

```bash
# Backend (Rust) - use sorter-db run-server instead
cd rustsorter/ && RUST_LOG=debug cargo run

# Frontend (React) - use sorter-db run-client instead  
cd frontsorter/ && npm run dev

# Build commands
cd rustsorter/ && cargo build      # Build backend
cd rustsorter/ && cargo test       # Run Rust tests
cd frontsorter/ && npm run build   # Build frontend
cd frontsorter/ && npm run lint    # Lint frontend

# Testing - use sorter-db to ensure services are running first
pip install -r ./test/requirements.txt
pytest                        # Run Python integration tests
python -m pytest            # Alternative test runner
```

## Project Structure

```
sorter/
├── database/
│   ├── cli/                 # Custom sorter-db CLI tool (TypeScript/Bun)
│   └── sql/                 # Database migrations and schema
├── rustsorter/              # Rust backend server (OpenAPI source)
│   └── src/                 # Rust source code with aide for OpenAPI
├── frontsorter/             # React frontend client (TypeScript)
│   ├── src/
│   │   ├── generated/       # 🤖 Auto-generated types from Rust backend
│   │   ├── api/             # Type-safe API client wrappers
│   │   ├── components/      # React components (TypeScript)
│   │   ├── pages/           # Application pages (TypeScript)
│   │   └── ...
│   ├── scripts/             # Type generation automation
│   └── plugins/             # Vite plugins for auto-type generation
├── test/                    # Python integration tests
├── .github/                 # GitHub Actions CI/CD + type sync workflows
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
- **CLI**: Custom TypeScript CLI tool using Commander.js
- **Runtime**: Bun for CLI tool, Node.js for frontend

## Development Workflow

1. **First time setup**:
   ```bash
   sorter-db setup
   sorter-db install-all
   ```

2. **Daily development**:
   ```bash
   # Terminal 1: Database
   sorter-db run-postgres
   
   # Terminal 2: Backend
   sorter-db run-server
   
   # Terminal 3: Frontend
   sorter-db run-client
   ```

3. **Database changes**:
   ```bash
   # After adding new migrations
   sorter-db migrate
   
   # To completely reset database
   sorter-db run-postgres --reset
   sorter-db migrate
   ```

4. **Testing**:
   ```bash
   # Ensure services are running first
   sorter-db run-postgres
   sorter-db run-server
   
   # Rust unit tests
   cd rustsorter && cargo test
   
   # Integration tests (Python)
   pip install -r ./test/requirements.txt
   pytest
   ```

## Environment Variables

The project uses a `.env` file in the root directory:
```bash
DATABASE_URL=postgres://postgres:password@localhost:5432/postgres?sslmode=disable
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

1. **Database connection issues**: Ensure PostgreSQL is running via `sorter-db run-postgres`
2. **Missing dependencies**: Run `sorter-db check-deps` and `sorter-db install-deps`
3. **Port conflicts**: Frontend typically runs on `:5173`, backend on default Axum port
4. **Migration issues**: Try `sorter-db reset-migrations` followed by `sorter-db migrate`

### Development Tips

- Use `RUST_LOG=debug` for verbose backend logging
- The `sorter-db` CLI is the recommended way to manage the project
- PostgreSQL data persists in `pgdata/` directory
- Frontend dev server has hot reload enabled
- Integration tests require both database and backend server to be running

## Contributing

See individual component READMEs and the main project contributors for specific development guidelines. The project tracks development time via Wakatime badges for key contributors.
