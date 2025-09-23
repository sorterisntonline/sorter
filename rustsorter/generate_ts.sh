#!/bin/bash
# Script to generate TypeScript types from Rust models

# Set the output directory
OUTPUT_DIR="../frontsorter/src/types/generated"

# Create the output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Run cargo test with the ts-rs feature to generate types
TS_RS_EXPORT_DIR="$OUTPUT_DIR" cargo test --features generate-ts generate_typescript_bindings -- --nocapture

echo "TypeScript types generated in $OUTPUT_DIR"