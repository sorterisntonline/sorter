#!/bin/bash

# This script applies environment-specific overrides
# Usage: ./update-env.sh <environment>

ENVIRONMENT=$1
OVERRIDES_DIR="overrides/$ENVIRONMENT"

if [ -z "$ENVIRONMENT" ]; then
    echo "Error: Environment not specified"
    echo "Usage: ./update-env.sh <environment>"
    exit 1
fi

if [ "$ENVIRONMENT" != "production" ] && [ "$ENVIRONMENT" != "staging" ]; then
    echo "Using default development environment..."
    exit 0
fi

echo "Applying $ENVIRONMENT overrides..."

# Check if overrides directory exists
if [ ! -d "$OVERRIDES_DIR" ]; then
    echo "No overrides found for $ENVIRONMENT"
    exit 0
fi

# Function to copy files recursively, maintaining directory structure
apply_overrides() {
    local source_dir="$1"
    local target_dir="$2"
    
    # Create target directory if it doesn't exist
    mkdir -p "$target_dir"
    
    # Copy all files from source to target, maintaining directory structure
    find "$source_dir" -type f -print0 | while IFS= read -r -d '' file; do
        # Get relative path
        rel_path="${file#$source_dir/}"
        # Create target directory structure
        mkdir -p "$target_dir/$(dirname "$rel_path")"
        # Copy file
        echo "Applying override: $rel_path"
        cp "$file" "$target_dir/$rel_path"
    done
}

# Apply overrides
if [ -d "$OVERRIDES_DIR" ]; then
    # Apply root directory overrides
    apply_overrides "$OVERRIDES_DIR" "."
fi

echo "Environment overrides applied successfully" 