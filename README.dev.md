# Sorter Development Guide

## Quick Start

```bash
# One-time setup
cd database/cli && npm install -g . && cd -
sorter-db setup && sorter-db install-all

# Start entire development environment
./scripts/dev.sh start
```

This will start all services:
- PostgreSQL database
- Rama cluster (ZooKeeper, Conductor, Supervisor)
- Database migrations
- Rust API server with Rama integration
- React frontend development server

## Process Management

### Using the dev.sh script:
```bash
./scripts/dev.sh start     # Start all services
./scripts/dev.sh stop      # Stop all services  
./scripts/dev.sh status    # Show service status
./scripts/dev.sh connect rust-server    # Connect to specific service
```

### Using overmind directly:
```bash
overmind start              # Start from Procfile
overmind connect postgres   # Connect to PostgreSQL logs
overmind connect rust-server        # Connect to Rust server logs
overmind ps                 # Show process status
overmind kill               # Stop all services
```

## Available Services

| Service | Description | Port |
|---------|-------------|------|
| postgres | PostgreSQL database | 5438 |
| zookeeper | Rama ZooKeeper | 2181 |
| conductor | Rama Conductor | 9999 |  
| supervisor | Rama Supervisor | various |
| migrate | Database migrations | - |
| rust-server | Rust API server | 8081 |
| vite | React dev server | 5173 |

## Development Workflow

1. **Start everything**: `./scripts/dev.sh start`
2. **View logs**: `overmind connect <service>` 
3. **Make changes**: Edit code, changes auto-reload
4. **Debug issues**: Connect to specific service logs
5. **Stop everything**: `./scripts/dev.sh stop` or Ctrl+C

## Troubleshooting

- **Database issues**: `overmind connect postgres` to see database logs
- **Rama issues**: `overmind connect conductor` or `overmind connect supervisor`
- **API issues**: `overmind connect rust-server` to see Rust server logs
- **Frontend issues**: `overmind connect vite` to see React dev server
- **Reset everything**: `./scripts/dev.sh restart`

The playground feature will be available at http://localhost:5173/playground once all services start successfully.
