# Sorter Development Guide

## Quick Start

```bash
# One-time setup
cd database/cli && npm install -g . && cd -
sorter-db setup && sorter-db install-all

# Start entire development environment
pm2 start
```

This will start all services:
- PostgreSQL database
- Rama cluster (ZooKeeper, Conductor, Supervisor)
- Database migrations
- Rust API server with Rama integration
- React frontend development server

## Process Management

### Using PM2:
```bash
pm2 start                             # Start all services from ecosystem.config.js
pm2 stop all                          # Stop all services  
pm2 status                            # Show service status
pm2 logs rust-server --nostream      # View specific service logs
pm2 restart <service>                 # Restart specific service
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

1. **Start everything**: `pm2 start`
2. **View logs**: `pm2 logs <service> --nostream` 
3. **Make changes**: Edit code, changes auto-reload
4. **Debug issues**: Check specific service logs
5. **Stop everything**: `pm2 stop all`

## Troubleshooting

- **Database issues**: `pm2 logs postgres --nostream` to see database logs
- **Rama issues**: `pm2 logs conductor --nostream` or `pm2 logs supervisor --nostream`
- **API issues**: `pm2 logs rust-server --nostream` to see Rust server logs
- **Frontend issues**: `pm2 logs vite --nostream` to see React dev server
- **Reset everything**: `pm2 stop all && pm2 start`

The playground feature will be available at http://localhost:5173/playground once all services start successfully.
