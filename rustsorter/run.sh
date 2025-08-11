#!/bin/bash

# Kill any existing instance
pkill -f "rustsorter"

# Run new instance
# cargo run --release
RUST_LOG=debug cargo run
