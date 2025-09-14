# Sorter DB CLI

A TypeScript CLI for managing Sorter database operations, built with Bun and Commander.js.

## Installation

```bash
cd database/cli
bun install
```

## Usage

The CLI provides three main commands:

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

## Features

- **Import Dump**: Supports both SQL text dumps and binary dumps with automatic detection
- **Run PostgreSQL**: Starts PostgreSQL container with proper volume mounts and configuration
- **Setup Docker**: Installs Docker and configures user permissions
- **Error Handling**: Comprehensive error handling and validation
- **Cross-platform**: Works on macOS, Linux, and Windows

## Requirements

- Bun runtime
- Docker (for database operations)
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
