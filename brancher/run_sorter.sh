#!/usr/bin/env bash
set -euo pipefail

# One-shot run: no dirs or run-id exposed
python3 brancher/gitsorter_cli.py run \
  --repo . \
  --name "gitsorter-default" \
  --model google/gemini-2.5-pro \
  --count 100
