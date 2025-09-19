#!/bin/bash
# Modern supervisord control using supervisord-mcp
# This provides much better AI integration and cleaner commands

# Check if we have arguments
if [ $# -eq 0 ]; then
    echo "Usage: ./ctl.sh <command> [arguments]"
    echo ""
    echo "Available commands:"
    echo "  status [name]           - Show process status"
    echo "  start <name>            - Start a process"
    echo "  stop <name>             - Stop a process"
    echo "  restart <name>          - Restart a process"
    echo "  list                    - List all processes"
    echo "  logs <name> [--lines N] - View process logs"
    echo "  info                    - System information"
    echo "  reload                  - Reload configuration"
    echo "  mcp                     - Start MCP server for AI agents"
    echo ""
    echo "Examples:"
    echo "  ./ctl.sh list"
    echo "  ./ctl.sh start rust-server"
    echo "  ./ctl.sh logs rust-server --lines 50"
    echo "  ./ctl.sh status"
    exit 1
fi

# Map common commands for convenience
case "$1" in
    "status")
        if [ -n "$2" ]; then
            uv run supervisord-mcp status "$2"
        else
            uv run supervisord-mcp list-processes
        fi
        ;;
    "list")
        uv run supervisord-mcp list-processes
        ;;
    "ps")
        uv run supervisord-mcp list-processes
        ;;
    *)
        # Pass through all other commands directly
        uv run supervisord-mcp "$@"
        ;;
esac
