#!/bin/bash

# Load environment variables from .env.test
export $(grep -v '^#' .env.test | xargs)

# Run pytest with coverage
python -m pytest -v --cov=. --cov-report=term-missing "$@" 