#!/bin/bash

# Run specific test for Reddit import flow
set -e

echo "Running Reddit import flow test..."

# Change to test directory
cd "$(dirname "$0")"

# Run the specific test
clojure -M:test -m clojure.test -v sorter-test.core/reddit-import-flow

echo "Test completed!"
