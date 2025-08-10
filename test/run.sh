#!/bin/bash

# Usage: ./run.sh [namespace] [test-name]
# Examples:
#   ./run.sh                                    # Run all tests
#   ./run.sh sorter-test.core                  # Run specific namespace
#   ./run.sh sorter-test.core websocket-hello-world  # Run specific test

NAMESPACE="$1"
TEST_NAME="$2"

if [ -n "$TEST_NAME" ] && [ -n "$NAMESPACE" ]; then
    echo "Running specific test: $NAMESPACE/$TEST_NAME"
    clojure -M:test --focus "$NAMESPACE/$TEST_NAME"
elif [ -n "$NAMESPACE" ]; then
    echo "Running namespace: $NAMESPACE"
    clojure -M:test --focus "$NAMESPACE"
else
    echo "Running all tests via kaocha"
    clojure -M:test
fi