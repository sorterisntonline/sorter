#!/bin/bash

# Kill any existing instance
pkill -f "rustsorter"

# Run new instance
RUST_LOG=debug cargo run