#!/usr/bin/env bash

# 1) Prepare artifacts from the current repo into a fixed out dir
python3 brancher/gitsorter_cli.py prepare --repo . --out .gitsorter/run

# 2) Ingest entities to the API (uses SORTER_API_URL/SORTER_API_KEY if set)
python3 brancher/gitsorter_cli.py ingest --dir .gitsorter/run

# 3) Cast LLM votes then print the latest ranking for the run
python3 brancher/gitsorter_cli.py vote-llm --run-id "$(jq -r .run_id .gitsorter/run/run_config.json)" --count 100 --model google/gemini-2.5-pro && \
python3 brancher/gitsorter_cli.py rank --run-id "$(jq -r .run_id .gitsorter/run/run_config.json)"
