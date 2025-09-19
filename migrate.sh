#!/bin/bash
set -a # automatically export all variables
source .env
set +a

# Set SSL mode to disable for dbmate
export PGSSLMODE=disable

dbmate --migrations-dir ./db/migrations up
