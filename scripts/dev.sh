#!/bin/bash
# Sorter Development Environment Script

set -e

# Ensure overmind is in PATH
export PATH=$HOME/.local/bin:$PATH

# Check if overmind is installed
if ! command -v overmind &> /dev/null; then
    echo "❌ Overmind not found. Installing..."
    mkdir -p ~/.local/bin
    curl -L https://github.com/DarthSim/overmind/releases/download/v2.5.1/overmind-v2.5.1-linux-amd64.gz -o /tmp/overmind.gz
    gunzip /tmp/overmind.gz
    chmod +x /tmp/overmind
    mv /tmp/overmind ~/.local/bin/overmind
    echo "✅ Overmind installed"
fi

case "$1" in
    "start"|"")
        echo "🚀 Starting Sorter development environment..."
        echo "   Use 'overmind connect <service>' to attach to individual processes"
        echo "   Available services: postgres, zookeeper, conductor, supervisor, migrate, rust-server, vite"
        echo "   Press Ctrl+C to stop all services"
        overmind start
        ;;
    "stop")
        echo "🛑 Stopping all services..."
        overmind kill
        ;;
    "restart")
        echo "🔄 Restarting all services..."
        overmind kill 2>/dev/null || true
        sleep 2
        overmind start
        ;;
    "status")
        overmind ps
        ;;
    "connect")
        if [ -z "$2" ]; then
            echo "Usage: $0 connect <service-name>"
            echo "Available services: postgres, zookeeper, conductor, supervisor, migrate, rust-server, vite"
            exit 1
        fi
        overmind connect "$2"
        ;;
    "help")
        echo "Sorter Development Environment"
        echo ""
        echo "Commands:"
        echo "  start     Start all services (default)"
        echo "  stop      Stop all services" 
        echo "  restart   Restart all services"
        echo "  status    Show service status"
        echo "  connect   Connect to a specific service"
        echo "  help      Show this help"
        ;;
    *)
        echo "Unknown command: $1"
        echo "Run '$0 help' for available commands"
        exit 1
        ;;
esac
