# Sorter DB CLI

A TypeScript CLI for managing Sorter database operations, built with Bun and Commander.js.

## Installation

```bash
# Install globally from the CLI directory
cd database/cli
npm install -g .

# Run setup to configure environment
sorter-db setup
```

The setup command will automatically:

- ✅ Check for required dependencies (Bun, Docker, dbmate)
- ✅ Create `.env` file with default configuration
- ✅ Validate your environment
- ✅ Provide next steps

## Usage

The CLI provides six main commands:

### Import Dump

Import data from a PostgreSQL dump file into the running postgres-dev container:

```bash
sorter-db import-dump /path/to/your/dumpfile.sql
sorter-db import-dump /path/to/your/dumpfile.dump
```

### Run PostgreSQL

Start the PostgreSQL container in foreground:

```bash
sorter-db run-postgres
```

With reset option (deletes all data):

```bash
sorter-db run-postgres --reset
```

### Setup Docker

Setup Docker for the current user (Ubuntu/Debian):

```bash
sorter-db setup-docker
```

### Migrate

Run database migrations using dbmate:

```bash
sorter-db migrate
```

### Setup

Setup sorter-db-cli environment and check dependencies:

```bash
sorter-db setup
```

### Validate Config

Validate PostgreSQL configuration files:

```bash
sorter-db validate-config
```

## Features

- **Import Dump**: Supports both SQL text dumps and binary dumps with automatic detection
- **Run PostgreSQL**: Starts PostgreSQL container with proper volume mounts and configuration
- **Setup Docker**: Installs Docker and configures user permissions
- **Migrate**: Run database migrations using dbmate with proper environment handling
- **Setup**: Automated environment setup and dependency checking
- **Validate Config**: Pre-flight validation of PostgreSQL configuration files
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

To check TypeScript types:

```bash
bun run type-check
```

To run linting:

```bash
bun run lint
```

To install dependencies:

```bash
bun run install-deps
```

To check dependencies:

```bash
bun run check
```
