#!/bin/bash
# Activate the virtual environment
source .venv/bin/activate

# Run supervisorctl with our local config, passing all arguments
supervisorctl -c supervisord.conf "$@"
