# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

Sorter is a multi-component democratic social media application with the following structure:

- **rustsorter/**: Rust-based backend API server using Axum web framework, SQLx for database operations, and PostgreSQL
- **frontsorter/**: React-based frontend using Vite, React Router, TailwindCSS, and React Query for state management
- **database/cli/**: TypeScript-based CLI tool (`sorter-db`) for database management and development setup
- **test/**: Python-based integration tests using pytest

## Common Development Commands

### Database Setup
```bash
# Install the CLI tool globally
cd database/cli && npm install -g . && cd -

# Setup development environment
sorter-db setup

# Install all dependencies
sorter-db install-all

# Start PostgreSQL (keep terminal open)
sorter-db run-postgres

# Run migrations
sorter-db migrate

# Reset database
sorter-db run-postgres --reset
```

### Backend (Rust)
```bash
cd rustsorter

# Run development server with debug logging
RUST_LOG=debug cargo run

# Run tests
./run_tests.sh

# Build for production
cargo build --release
```

### Frontend (React)
```bash
cd frontsorter

# Install dependencies
npm i

# Run development server (typically http://localhost:5173)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Integration Testing
```bash
# Install test dependencies
pip install -r ./test/requirements.txt

# Run all tests
pytest

# Run specific test
python -m pytest test/specific_test.py
```

## Key Technologies

- **Backend**: Rust with Axum, SQLx, PostgreSQL, bcrypt for auth, ELO rating system
- **Frontend**: React 19, Vite, TailwindCSS 4, React Router 7, React Query, React Hook Form with Zod validation
- **Database**: PostgreSQL with custom migration system
- **DevOps**: Docker containers, GitHub Actions CI/CD

## Database Management

The project uses a custom CLI tool for database operations. The PostgreSQL database runs in a Docker container and includes custom migration handling. Database schema changes should be made through the migration system.

## Project Structure Notes

- The Rust backend serves as an API with detailed OpenAPI documentation via the `aide` crate
- The React frontend uses modern patterns with hooks, context, and query-based state management
- All three main components (backend, frontend, CLI) have their own package management (Cargo.toml, package.json)
- Integration tests cover the full stack and require both backend and database to be running