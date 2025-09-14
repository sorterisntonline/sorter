# Sorter DB CLI

A TypeScript CLI for managing Sorter database operations, built with Bun and Commander.js.

## Installation

### One-Line Installation (Recommended)

```bash
# From anywhere in the sorter project
./install-sorter-db.sh

# Or directly from the CLI directory
./database/cli/install.sh

# Or using the TypeScript installer
bun run database/cli/scripts/install.ts

# Or from a remote URL (when published)
curl -fsSL https://raw.githubusercontent.com/your-org/sorter/main/database/cli/install.sh | bash
```

### Manual Installation

#### Local Development

```bash
cd database/cli
bun install
```

#### Global Installation

```bash
# Install globally with npm
npm install -g .

# After installation, run setup
sorter-db setup
```

### Post-Installation

After installation, the CLI will automatically:

- ✅ Check for required dependencies (Bun, Docker, dbmate)
- ✅ Create `.env` file with default configuration
- ✅ Validate your environment
- ✅ Provide next steps

If something goes wrong, run:

```bash
sorter-db setup
```

## Usage

The CLI provides six main commands:

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

### Setup

Setup sorter-db-cli environment and check dependencies:

```bash
bun run index.ts setup
```

### Validate Config

Validate PostgreSQL configuration files:

```bash
bun run index.ts validate-config
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
