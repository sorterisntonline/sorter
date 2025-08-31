#!/usr/bin/env bash
set -euo pipefail

# One-shot run: no dirs or run-id exposed
python3 brancher/gitsorter_cli.py run \
  --repo . \
  --name "flash2" \
  --model google/gemini-2.5-flash \
  --count 100
