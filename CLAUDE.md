# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

Sorter is a multi-component democratic social media application with the following structure:

- **rustsorter/**: Rust-based backend API server using Axum web framework, SQLx for database operations, and PostgreSQL
- **frontsorter/**: React-based frontend using Vite, React Router, TailwindCSS, and React Query for state management
- **database/cli/**: TypeScript-based CLI tool (`sorter-db`) for database management and development setup
- **test/**: Python-based integration tests using pytest

## 🚀 Automatic Type Generation System

This project features **automatic TypeScript type generation** from the Rust backend's OpenAPI specification:

### Automatic Features
- **Real-time type sync**: Types auto-regenerate when Rust backend changes during development
- **Runtime validation**: All API responses validated with Zod schemas at runtime
- **Compile-time safety**: Full TypeScript integration with path completion and error checking
- **Zero manual maintenance**: Types stay in sync automatically via Vite plugin and GitHub Actions

### Generated Files (Auto-managed)
- `frontsorter/src/generated/api-types.ts` - TypeScript type definitions from OpenAPI
- `frontsorter/src/generated/api-client.ts` - Zod schemas + type-safe client with validation
- `frontsorter/src/generated/openapi.json` - Raw OpenAPI spec from backend

### Type Generation Commands
```bash
# Manual generation (usually not needed)
npm run generate-types

# Watch mode for development
npm run generate-types:watch

# Full development with backend watching
npm run dev:full
```

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

- **Backend**: Rust with Axum, SQLx, PostgreSQL, bcrypt for auth, ELO rating system, OpenAPI with `aide` crate
- **Frontend**: TypeScript, React 19, Vite, TailwindCSS 4, React Router 7, React Query, React Hook Form with Zod validation
- **Type Safety**: Automatic TypeScript generation from Rust OpenAPI spec, runtime validation with Zod schemas
- **Database**: PostgreSQL with custom migration system
- **DevOps**: Docker containers, GitHub Actions CI/CD with automatic type synchronization

## Database Management

The project uses a custom CLI tool for database operations. The PostgreSQL database runs in a Docker container and includes custom migration handling. Database schema changes should be made through the migration system.

## TypeScript Migration and Type Safety

### Frontend TypeScript Conversion
The frontend has been fully converted from JavaScript to TypeScript with:
- All `.js` and `.jsx` files converted to `.ts` and `.tsx`
- Comprehensive type definitions for all components and API interfaces
- ESLint configuration updated for TypeScript support
- Build process includes TypeScript compilation

### Automatic Type Generation Workflow
1. **Development**: Start with `npm run dev` - types auto-generate when backend changes
2. **Manual Generation**: `npm run generate-types` to regenerate from running backend
3. **Watch Mode**: `npm run generate-types:watch` for continuous monitoring
4. **Full Development**: `npm run dev:full` for backend file watching

### Migration Guide for Existing Components
When updating existing components to use the new type-safe API client:

```typescript
// ❌ Old manual fetch approach
const response = await fetch('/api/entity');
const entities = await response.json(); // No type safety

// ✅ New type-safe approach
import { entityApi } from '../api/client';
const entities = await entityApi.listEntities(); // Fully typed + validated
```

### API Client Usage
```typescript
import { entityApi, voteApi, validators } from '../api/client';

// Type-safe entity operations
const entities = await entityApi.listEntities();
const newEntity = await entityApi.createEntity({
  pk_namespace: 'custom.namespace',
  title: 'My Entity'
});

// Type-safe voting with runtime validation
const voteResult = await voteApi.submitVote({
  left_ns: 'spotify.track',
  left_pk: 'abc123',
  right_ns: 'spotify.track',
  right_pk: 'def456',
  magnitude: 1
});

// Manual validation when needed
const safeEntity = validators.safeEntity(unknownData);
if (safeEntity.success) {
  // safeEntity.data is now typed as Entity
}
```

## Project Structure Notes

- The Rust backend serves as an API with detailed OpenAPI documentation via the `aide` crate
- The TypeScript frontend uses modern patterns with hooks, context, and query-based state management
- **Generated Types**: `frontsorter/src/generated/` contains auto-managed TypeScript types and Zod schemas
- **Type-Safe Client**: `frontsorter/src/api/client.ts` provides drop-in replacements for manual fetch calls
- All three main components (backend, frontend, CLI) have their own package management (Cargo.toml, package.json)
- Integration tests cover the full stack and require both backend and database to be running

## Development Workflow

### Starting Development
```bash
# 1. Start database
sorter-db run-postgres

# 2. Run migrations
sorter-db migrate

# 3. Start backend (in separate terminal)
cd rustsorter && RUST_LOG=debug cargo run

# 4. Start frontend with auto-type-generation (in separate terminal)
cd frontsorter && npm run dev
```

### Type Generation Process
- **Automatic**: Vite plugin polls backend every 5 seconds during development
- **On Backend Changes**: File watcher detects Rust changes, triggers regeneration
- **CI/CD**: GitHub Actions automatically commits type updates when backend schema changes
- **Build Time**: Types are regenerated during production builds to ensure sync

### Linting and Type Checking
```bash
cd frontsorter

# Type checking without emitting files
npm run type-check

# ESLint with TypeScript support
npm run lint

# Build with type checking
npm run build
```