#!/bin/bash

# Kill any existing instance
pkill -f "rustsorter"

# Run new instance
cargo run