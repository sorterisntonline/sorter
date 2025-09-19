#!/bin/bash
# Quick debug script to tail all logs and show service status

echo "=== Service Status ==="
./ctl.sh status

echo -e "\n=== Recent Rust Server Logs ==="
tail -20 logs/rust-server.log 2>/dev/null || echo "No rust-server.log found"

echo -e "\n=== Recent Postgres Logs ==="
tail -10 logs/postgres.log 2>/dev/null || echo "No postgres.log found"

echo -e "\n=== Recent Vite Client Logs ==="
tail -10 logs/vite-client.log 2>/dev/null || echo "No vite-client.log found"

echo -e "\n=== To follow logs in real-time, run: ==="
echo "tail -f logs/rust-server.log"
echo "tail -f logs/postgres.log" 
echo "tail -f logs/vite-client.log"
