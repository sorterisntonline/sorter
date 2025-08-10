#!/bin/bash

# Run database setup test only
set -e

echo "Running database setup test..."

# Change to test directory
cd "$(dirname "$0")"

# Run the database setup test
clojure -M:test -m clojure.test -v sorter-test.core/database-setup-test

echo "Database test completed!"
