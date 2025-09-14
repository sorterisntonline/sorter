#!/usr/bin/env bash
set -e

echo "🚀 Installing sorter-db-cli..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$SCRIPT_DIR"

echo "📁 CLI directory: $CLI_DIR"

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

# Check if package.json exists in the CLI directory
if [ ! -f "$CLI_DIR/package.json" ]; then
    echo "❌ package.json not found in $CLI_DIR"
    echo "   Make sure you're running this from the correct location"
    exit 1
fi

# Install globally from the CLI directory
echo "📦 Installing sorter-db-cli globally..."
cd "$CLI_DIR"
npm install -g .

# Check installation
if command -v sorter-db &> /dev/null; then
    echo "✅ sorter-db-cli installed successfully!"
    echo ""
    echo "🔍 Running setup..."
    sorter-db setup || true
    echo ""
    echo "📖 Quick start:"
    echo "   sorter-db --help"
    echo "   sorter-db run-postgres"
    echo "   sorter-db migrate"
else
    echo "❌ Installation failed. Please try again."
    exit 1
fi
