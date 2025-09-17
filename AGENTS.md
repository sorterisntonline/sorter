# AGENTS.md - Sorter Development Guide

## Overview

Sorter is a **Rust and React based pair-wise staunchly democratic social media application**. The project consists of:

- **Backend**: Rust server (`rustsorter/`) using Axum web framework
- **Frontend**: React client (`frontsorter/`) using Vite, TypeScript, and TailwindCSS
- **Database**: PostgreSQL with migrations managed by dbmate
- **CLI Tool**: Custom `sorter-db` CLI for project management

## Quick Start Commands

### Unified Development Environment (Recommended)

```bash
# Initial setup (one-time)
cd database/cli && npm install -g . && cd -
sorter-db setup
sorter-db install-all

# Start entire development stack (Recommended)
pm2 start                      # Start all services from ecosystem.config.js
pm2 stop all                   # Stop all PM2 services
pm2 status                     # Show PM2 process status
pm2 logs --nostream            # View all logs
pm2 logs <service> --nostream  # View logs for specific service
```

### Manual Commands (for troubleshooting)

```bash
# Database management
sorter-db run-postgres          # Start PostgreSQL (foreground)
sorter-db run-postgres --reset  # Reset database completely
sorter-db migrate               # Run database migrations
sorter-db reset-migrations      # Reset migration state

# Development servers
sorter-db run-server           # Start Rust backend server
sorter-db run-client           # Start React frontend client

# Dependency management
sorter-db check-deps           # Check system dependencies
sorter-db install-deps         # Install missing dependencies
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
├── rustsorter/              # Rust backend server
│   └── src/                 # Rust source code
├── frontsorter/             # React frontend client
│   └── src/                 # React source code
├── test/                    # Python integration tests
├── .github/                 # GitHub Actions CI/CD
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
5. **PM2 process failures**: 
   - Use `pm2 logs --nostream` to check logs without tailing
   - Check individual process logs: `pm2 logs [process-name] --nostream`
   - Restart specific services: `pm2 restart [process-name]`

### Rama Service Logs

Rama services (zookeeper, conductor, supervisor) use log4j and write logs directly to files, not stdout/stderr. PM2 logs won't show these. View Rama logs with:

```bash
# View live logs
tail -f rama-1.1.0/logs/dev-zookeeper.log
tail -f rama-1.1.0/logs/conductor.log  
tail -f rama-1.1.0/logs/supervisor.log

# View recent log entries
tail -100 rama-1.1.0/logs/dev-zookeeper.log
tail -100 rama-1.1.0/logs/conductor.log
tail -100 rama-1.1.0/logs/supervisor.log

# List all Rama log files
ls -la rama-1.1.0/logs/
```

### Development Tips

- Use `RUST_LOG=debug` for verbose backend logging
- The `sorter-db` CLI is the recommended way to manage the project
- PostgreSQL data persists in `pgdata/` directory
- Frontend dev server has hot reload enabled
- Integration tests require both database and backend server to be running

## Contributing

See individual component READMEs and the main project contributors for specific development guidelines. The project tracks development time via Wakatime badges for key contributors.

## Debugging Rama Playground Endpoints

**Issue**: Playground endpoints were failing with connection errors and data wasn't persisting.

### Root Cause Analysis Process

#### 1. Environment Variable Configuration
- **Problem**: Rust server couldn't connect to Rama due to missing environment variables
- **Solution**: Added to `.env`:
  ```bash
  RAMA_BASE_URL=http://localhost:8888
  RAMA_MODULE_NAME=sorter.playground-module/PlaygroundModule
  ```

#### 2. URL Encoding Issues
- **Problem**: Module name `sorter.playground-module/PlaygroundModule` contains `/` that needs URL encoding
- **Solution**: Updated Rust client to URL-encode module names (`/` → `%2F`)
- **Code**: Added `urlencoding = "2.1"` dependency and `encode(&self.module)` in `rama_client.rs`

#### 3. Redirect Handling
- **Problem**: Conductor redirects to supervisors, Rust client needed to follow redirects
- **Solution**: Used conductor admin UI port (8888) which properly handles redirects

### Stream Topology Debugging Process

#### 4. Adding Debug Prints to Clojure Module
When data wasn't persisting, added debug prints to the stream topology:

```clojure
(source> *command-depot :> {:keys [*list *action *value] :as *command})
(println "command1: " *list *action *value)
(println "command2: " *command)
```

#### 5. Redeploying Rama Module
**Process**:
```bash
# 1. Recompile Clojure module
cd /home/tommy/programming/sorter/rama-sorter && lein uberjar

# 2. Redeploy to Rama cluster
cd /home/tommy/programming/sorter/rama-1.1.0
./rama deploy --action update --jar /path/to/target/rama-clojure-starter-1.0.0-SNAPSHOT-standalone.jar --module sorter.playground-module/PlaygroundModule
```

#### 6. Finding Debug Output Location
**Key Discovery**: Debug prints from Clojure topology go to `.out` files, not `.log` files!

**Locations**:
- Worker logs: `/home/tommy/programming/sorter/rama-1.1.0/logs/worker-*.log` (system logs)
- **Debug output**: `/home/tommy/programming/sorter/rama-1.1.0/logs/worker-*.out` (stdout/println)

**Debugging Commands**:
```bash
# Check latest worker stdout
tail -10 /home/tommy/programming/sorter/rama-1.1.0/logs/worker-*.out

# Monitor debug output in real-time
tail -f /home/tommy/programming/sorter/rama-1.1.0/logs/worker-*.out
```

#### 7. Data Destructuring Issue Discovery
Debug output revealed the actual problem:
```
command1:  nil nil nil                                    # ← Values were nil!
command2:  {list default, value test, action append}     # ← Data was present
```

**Root Cause**: Clojure destructuring syntax mismatch
- **Wrong**: `{:keys [*list *action *value]}` (expects keyword keys like `:list`)
- **Correct**: `{:strs [*list *action *value]}` (for string keys like `"list"`)

### General Debugging Strategy for Rama Issues

#### 1. Layer-by-Layer Debugging
1. **Network**: Can Rust connect to Rama? (environment variables, URL encoding)
2. **API**: Are requests reaching the depot? (check conductor/supervisor redirects)
3. **Processing**: Is the topology processing events? (add debug prints)
4. **Data**: Are updates reaching PState? (query PState directly)

#### 2. Key Log Locations
- **Rust client errors**: PM2 logs (`pm2 logs rust-server`)
- **Rama connection errors**: Worker logs (`worker-*.log`)
- **Topology debug output**: Worker stdout (`worker-*.out`)
- **Conductor/Supervisor status**: PM2 logs for those services

#### 3. Debug Print Strategy
When topology isn't working as expected:
1. Add `(println)` statements to see data flow
2. Print both destructured variables AND raw data
3. Redeploy module to see changes
4. Check `.out` files for output (not `.log` files)

#### 4. Module Deployment Workflow
```bash
# Always use this pattern for Rama module updates:
cd rama-sorter && lein uberjar
cd ../rama-1.1.0
./rama deploy --action update --jar ../rama-sorter/target/[jar-name] --module [module-name]
```

### Final Working State
- ✅ Rust ↔ Rama connection established
- ✅ API endpoints functional
- ✅ Stream topology processing depot events
- ✅ Debug prints showing correct data flow
- 🔄 PState persistence (minor remaining issue with aggregation/queries)

The core playground endpoint functionality is now working - the original connection and processing issues are resolved.
