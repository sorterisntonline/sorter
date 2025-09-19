# Supervisord Development Environment (with MCP)

## Prerequisites

First-time setup for newcomers:
```bash
# Install UV (Python package manager) if not installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Add supervisord-mcp to the project (if not already added)
uv add supervisord-mcp
```

## Quick Start

1. **Start everything** (in the background):
   ```bash
   ./start.sh
   ```

2. **Check status** (in another terminal):
   ```bash
   ./ctl.sh status
   ./ctl.sh list                   # Alternative: list all processes
   ```

3. **Control individual services**:
   ```bash
   ./ctl.sh restart rust-server    # Restart backend
   ./ctl.sh stop vite-client       # Stop frontend
   ./ctl.sh start postgres         # Start database
   ./ctl.sh start migrations       # Run migrations (one-time)
   ./ctl.sh info                   # System information
   ```

4. **Debug and view logs** (using AI-powered MCP):
   ```bash
   ./debug.sh                      # Smart debug overview
   ./ctl.sh logs rust-server       # View recent logs
   ./ctl.sh logs rust-server --lines 50  # More logs
   ./ctl.sh logs postgres --stderr # Error logs only
   tail -f logs/rust-server.log    # Follow file logs (fallback)
   ```

5. **Stop everything**:
   ```bash
   ./ctl.sh stop rust-server       # Stop individual services
   ./ctl.sh stop postgres
   ./ctl.sh stop vite-client
   # OR kill the supervisord process from ./start.sh terminal
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

## AI/Agent Integration (MCP Protocol) 

The project now uses **supervisord-mcp** which provides superior AI integration via the Model Context Protocol:

### For AI Agents/Assistants:
```bash
./ctl.sh mcp                    # Start MCP server for AI agents
```

### MCP Configuration (for Claude Desktop, etc.):
```json
{
  "mcpServers": {
    "supervisord-mcp": {
      "command": "uv",
      "args": ["run", "supervisord-mcp", "mcp"],
      "cwd": "/path/to/sorter"
    }
  }
}
```

### Available MCP Tools for AI:
- `start_process`: Start a process
- `stop_process`: Stop a process  
- `restart_process`: Restart a process
- `list_processes`: List all processes
- `get_process_status`: Get detailed status
- `get_logs`: Retrieve process logs
- `get_system_info`: System information
- `reload_config`: Reload configuration

This is much more powerful than raw XML-RPC since it's designed specifically for AI agents!
