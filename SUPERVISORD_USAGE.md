# Supervisord Development Environment

## Quick Start

1. **Start everything** (in the background):
   ```bash
   ./start.sh
   ```

2. **Check status** (in another terminal):
   ```bash
   ./ctl.sh status
   ```

3. **Control individual services**:
   ```bash
   ./ctl.sh restart rust-server    # Restart backend
   ./ctl.sh stop vite-client       # Stop frontend
   ./ctl.sh start postgres         # Start database
   ./ctl.sh start migrations       # Run migrations (one-time)
   ```

4. **Debug and view logs**:
   ```bash
   ./debug.sh                      # Show status and recent logs
   tail -f logs/rust-server.log    # Follow rust-server logs
   tail -f logs/postgres.log       # Follow postgres logs
   tail -f logs/vite-client.log    # Follow vite-client logs
   ```

5. **Stop everything**:
   ```bash
   ./ctl.sh shutdown
   ```

## Services

- **postgres**: PostgreSQL database (port 5438)
- **rust-server**: Axum backend server
- **vite-client**: React frontend dev server
- **migrations**: Database migrations (manual start only)

## Troubleshooting

- If postgres fails to start, try: `docker stop postgres-dev`
- Logs are in `logs/` directory
- Configuration is in `supervisord.conf`

## AI/Agent Integration

Supervisord exposes an XML-RPC API via `supervisor.sock` for programmatic control.

Example Python code to check service status:
```python
import xmlrpc.client
server = xmlrpc.client.ServerProxy('unix:///path/to/supervisor.sock')
status = server.supervisor.getProcessInfo('rust-server')
print(f"Status: {status['statename']}")
```
