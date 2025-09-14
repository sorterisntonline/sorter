#!/bin/bash
set -e

echo "🚀 Installing sorter-db-cli..."

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

# Install globally
echo "📦 Installing sorter-db-cli globally..."
npm install -g .

# Check installation
if command -v sorter-db &> /dev/null; then
    echo "✅ sorter-db-cli installed successfully!"
    echo ""
    echo "🔍 Checking dependencies..."
    sorter-db check || true
    echo ""
    echo "📖 Quick start:"
    echo "   sorter-db --help"
    echo "   sorter-db run-postgres"
    echo "   sorter-db migrate"
else
    echo "❌ Installation failed. Please try again."
    exit 1
fi
