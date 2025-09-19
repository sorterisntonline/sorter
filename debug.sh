#!/bin/bash
# Quick debug script using supervisord-mcp

echo "=== Service Status ==="
./ctl.sh status

echo -e "\n=== System Information ==="
./ctl.sh info

echo -e "\n=== Recent Rust Server Logs ==="
./ctl.sh logs rust-server --lines 10 2>/dev/null || echo "rust-server not running or no logs"

echo -e "\n=== Recent Postgres Logs ==="
./ctl.sh logs postgres --lines 5 2>/dev/null || echo "postgres not running or no logs"

echo -e "\n=== Recent Vite Client Logs ==="  
./ctl.sh logs vite-client --lines 5 2>/dev/null || echo "vite-client not running or no logs"

echo -e "\n=== Useful Commands ==="
echo "./ctl.sh logs rust-server --lines 50    # More rust logs"
echo "./ctl.sh restart rust-server            # Restart backend"
echo "./ctl.sh start migrations               # Run migrations"
echo "tail -f logs/rust-server.log            # Follow file logs"
