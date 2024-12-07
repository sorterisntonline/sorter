#!/bin/sh

# Generate the config.edn file
echo "{:jdbc-url \"postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}\"}" > database/config.edn

# Start the application using exec to replace the shell with the application process
exec clj -J-Djdk.attach.allowAttachSelf -A:dev -X user/main
