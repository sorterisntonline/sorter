# Rank Centrality Baseline (Pre-sprs)

## Implementation summary
- `build_rank_graph` maps every entity to a node ID, clamps vote magnitudes to ±50, and emits a bidirectional weighted edge for each comparison where `weight = 50 + magnitude`. A magnitude of `+50` means the left entity dominates the right (edge weight 100 vs 0), while `0` leaves a 50/50 split.
- `calculate_rank_centrality` computes the maximum outgoing weight across nodes and then iteratively applies a dense transition. For each iteration it:
  1. Clones the previous score vector.
  2. For every target node `j`, adds its self-loop share `(max_out_deg - out_deg[j]) / max_out_deg`.
  3. Performs an inner loop over every other node `i`, scanning `i`'s entire outgoing adjacency list to find edges that end at `j`, normalizing each match by `max_out_deg`.
- The nested `for j { for i { scan edges(i) } }` structure makes the work per iteration proportional to `O(N^2 + N·E)`. On dense subgraphs that degenerates to cubic behaviour and dominates the ranking cost before any database or API overhead is considered.

## Benchmark setup
- Criterion 0.5.1 with the default configuration (100 samples, 3 s warmup).
- Synthetic datasets mimic `rank_centrality.py`: a random spanning tree plus extra pairings, deterministic `StdRng::seed_from_u64(42)`.
- Scenarios:
  - `128_items_256_extra`: 128 entities, 256 extra comparisons.
  - `256_items_512_extra`: 256 entities, 512 extra comparisons.
- Rust nightly `1.92.0-nightly (a454fccb0 2025-09-15)` targeting `x86_64-unknown-linux-gnu`.

## Criterion results (baseline)
| Scenario | Mean time (ms) | Median time (ms) | Std. dev. (ms) |
| --- | --- | --- | --- |
| 128_items_256_extra | 262.71 | 257.67 | 17.52 |
| 256_items_512_extra | 1333.44 | 1311.78 | 54.51 |

Raw estimate JSON is stored at `benchmarks/rank_centrality_baseline_2025-09-16.json` (generated  with the same run) for future comparisons.

## Next steps
- Recast the iteration as an edge-centric accumulation to bring the dense triple loop down to `O(E)` per iteration.
- Prototype a sparse transition matrix with `sprs` and use the same datasets to quantify the speedup.
