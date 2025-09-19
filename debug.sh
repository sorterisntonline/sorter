#!/bin/bash
# Quick debug script - use MCP supervisord tools for full debugging

echo "=== Sorter Debug Overview ==="
echo
echo "Use MCP supervisord tools in your AI agent:"
echo "- mcp__supervisord__list_processes       # List all processes"
echo "- mcp__supervisord__get_process_status   # Check individual process"  
echo "- mcp__supervisord__get_logs             # View recent logs"
echo "- mcp__supervisord__restart_process      # Restart services"
echo "- mcp__supervisord__start_process        # Start services"
echo
echo "Or check logs manually:"
echo "tail -f logs/rust-server.log"
echo "tail -f logs/postgres.log"  
echo "tail -f logs/vite-client.log"
echo
echo "Direct health checks:"
echo "curl http://localhost:8081/api/health    # Rust API"
echo "curl http://localhost:5173/api/health    # Via Vite proxy"
