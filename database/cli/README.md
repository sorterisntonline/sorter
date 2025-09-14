# Sorter DB CLI

A TypeScript CLI for managing Sorter database operations, built with Bun and Commander.js.

## Installation

### Local Development

```bash
cd database/cli
bun install
```

### Global Installation

```bash
# Install globally with npm (recommended)
npm install -g .

# Or install from a directory
npm install -g /path/to/database/cli

# After installation, use from anywhere:
sorter-db --help
```

## Usage

The CLI provides four main commands:

### Import Dump

Import data from a PostgreSQL dump file into the running postgres-dev container:

```bash
bun run index.ts import-dump /path/to/your/dumpfile.sql
bun run index.ts import-dump /path/to/your/dumpfile.dump
```

### Run PostgreSQL

Start the PostgreSQL container in foreground:

```bash
bun run index.ts run-postgres
```

With reset option (deletes all data):

```bash
bun run index.ts run-postgres --reset
```

### Setup Docker

Setup Docker for the current user (Ubuntu/Debian):

```bash
bun run index.ts setup-docker
```

### Migrate

Run database migrations using dbmate:

```bash
bun run index.ts migrate
```

## Features

- **Import Dump**: Supports both SQL text dumps and binary dumps with automatic detection
- **Run PostgreSQL**: Starts PostgreSQL container with proper volume mounts and configuration
- **Setup Docker**: Installs Docker and configures user permissions
- **Migrate**: Run database migrations using dbmate with proper environment handling
- **Error Handling**: Comprehensive error handling and validation
- **Cross-platform**: Works on macOS, Linux, and Windows

## Requirements

- Bun runtime
- Docker (for database operations)
- dbmate (for migrations)
- Node.js 18+ (for TypeScript compilation)

## Development

To run in development mode:

```bash
bun run dev
```

To build for production:

```bash
bun run build
```
