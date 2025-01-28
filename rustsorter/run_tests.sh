cargo run --release --bin test_rank > data.csv
cat data.csv | python3 src/bin/graph.py
open ranking_error.png
