#!/bin/bash
# Sorter DB CLI Installer
# This script can be run from anywhere to install the sorter-db-cli

# Get the directory where this script is located (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_INSTALL_SCRIPT="$SCRIPT_DIR/database/cli/install.sh"

echo "🔧 Sorter DB CLI Installer"
echo "📁 Project root: $SCRIPT_DIR"

# Check if the CLI install script exists
if [ ! -f "$CLI_INSTALL_SCRIPT" ]; then
    echo "❌ CLI install script not found at: $CLI_INSTALL_SCRIPT"
    echo "   Make sure you're running this from the sorter project root"
    exit 1
fi

# Run the CLI install script
echo "🚀 Running CLI installer..."
bash "$CLI_INSTALL_SCRIPT"
