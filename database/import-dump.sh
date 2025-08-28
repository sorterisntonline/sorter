#!/bin/bash
set -e

# ==============================================================================
# Sorter DB Dump Importer - Written by Gemini
# ==============================================================================
# Purpose:
# --------
# This script imports data from a PostgreSQL dump file (either binary or SQL)
# into the RUNNING 'postgres-dev' Docker container.
#
# Prerequisites:
# --------------
# 1. The 'postgres-dev' container MUST be running. You can start it using the
#    'run-postgres.sh' script.
# 2. You must have a PostgreSQL dump file to import.
#
# Usage:
# ------
# From the 'database' directory, run:
# ./import-dump.sh /path/to/your/dumpfile.sql
# or
# ./import-dump.sh /path/to/your/dumpfile.dump
#
# ==============================================================================

# --- Configuration ---
CONTAINER_NAME="postgres-dev"
PG_DUMP_DATA=$1

# --- Validation Checks ---

# Check if a dump file path was provided
if [ -z "$PG_DUMP_DATA" ]; then
    echo "Error: You must provide the path to the PostgreSQL dump file."
    echo "Usage: $0 /path/to/your/dumpfile.sql"
    exit 1
fi

# Check if the dump file actually exists
if [ ! -f "$PG_DUMP_DATA" ]; then
    echo "Error: The file '$PG_DUMP_DATA' was not found."
    exit 1
fi

# Check if the Docker container is running
if ! docker ps | grep -q $CONTAINER_NAME; then
    echo "Error: The '$CONTAINER_NAME' container is not running."
    echo "Please start it first using the './run-postgres.sh' script."
    exit 1
fi

echo "Starting data import into container '$CONTAINER_NAME' from file '$PG_DUMP_DATA'..."

# --- Import Logic ---

# Track if import was successful
IMPORT_SUCCESS=false

# Check if file is binary or text by looking at first bytes
if head -c 5 "$PG_DUMP_DATA" | grep -q "^PGDMP"; then
    echo "Importing data from binary dump..."
    
    # For binary dumps, attempt to use pg_restore with proper error handling
    if docker exec -i -e PGPASSWORD=password $CONTAINER_NAME pg_restore -U postgres -d postgres --clean --if-exists < "$PG_DUMP_DATA"; then
        echo "Binary dump import successful."
        IMPORT_SUCCESS=true
    else
        echo "ERROR: pg_restore failed. This could be due to version incompatibility."
        echo "Attempting alternative restore method with --no-owner and --no-acl flags..."
        
        # Try with --no-owner and --no-acl flags which can help with version compatibility
        if docker exec -i -e PGPASSWORD=password $CONTAINER_NAME pg_restore --no-owner --no-acl -U postgres -d postgres --clean --if-exists < "$PG_DUMP_DATA"; then
            echo "Alternative restore method successful."
            IMPORT_SUCCESS=true
        else
            echo "ERROR: All restore methods failed. Unable to import the binary dump file."
        fi
    fi
else
    echo "Importing data from SQL text dump..."
    # Use psql for text dumps
    # Using a transaction to ensure atomicity
    echo "Starting SQL import transaction..."
    if cat "$PG_DUMP_DATA" | docker exec -i -e PGPASSWORD=password $CONTAINER_NAME psql -U postgres -d postgres -v ON_ERROR_STOP=1; then
        echo "SQL data import successful."
        IMPORT_SUCCESS=true
    else
        echo "ERROR: psql command failed. The transaction was automatically rolled back."
        echo "Please check your SQL dump file for errors."
    fi
fi

# --- Final Status ---

if [ "$IMPORT_SUCCESS" = true ]; then
    echo "Data import completed successfully."
else
    echo "Data import failed. The database may contain incomplete data or be unchanged."
    exit 1
fi