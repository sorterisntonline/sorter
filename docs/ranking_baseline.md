# Rank Centrality Benchmarks (Dense vs sprs)

## Dense implementation (baseline)
- `build_rank_graph` maps every entity to a node ID, clamps vote magnitudes to ±50, and emits a bidirectional weighted edge for each comparison where `weight = 50 + magnitude`. A magnitude of `+50` means the left entity dominates the right (edge weight 100 vs 0), while `0` leaves a 50/50 split.
- `calculate_rank_centrality_dense` computes the maximum outgoing weight across nodes and then iteratively applies a dense transition. For each iteration it clones the previous score vector and, for every target node `j`, scans every other node `i` and `i`'s outgoing adjacency list to accumulate incoming mass. The nested `for j { for i { scan edges(i) } }` structure produces `O(N^2 + N·E)` work per iteration, which degenerates toward cubic time on dense subgraphs.

## sprs-backed implementation
- `calculate_rank_centrality_sparse` builds a sparse transition matrix once. For each source node it emits a self-loop weight `(max_out_deg - out_deg[u]) / max_out_deg` plus normalized outgoing weights, storing them in a `TriMat` (rows represent targets so `mat * scores` yields the new distribution).
- The triplet matrix is converted to `CsMat` (`usize` pointer type) and each power-iteration step becomes a call to `sprs::prod::mul_acc_mat_vec_csr`, turning the update into an `O(E)` sparse matrix–vector multiply. Memory stays dense-friendly because we reuse the existing CSR graph while building the matrix.
- We keep both implementations behind `RankEngine`; the API calls the sprs-backed path while `rank_entities_dense` is retained for benchmarking and regression checks.

## Benchmark setup
- Criterion 0.5.1 (100 samples, 3 s warmup) on Rust nightly `1.92.0-nightly (a454fccb0 2025-09-15)` targeting `x86_64-unknown-linux-gnu`.
- Synthetic datasets mimic `rank_centrality.py`: a random spanning tree plus extra pairings, deterministic `StdRng::seed_from_u64(42)`.
- Scenarios:
  - `128_items_256_extra`: 128 entities, 256 extra comparisons.
  - `256_items_512_extra`: 256 entities, 512 extra comparisons.

## Criterion results (2025-09-16)
| Scenario | Dense mean (ms) | sprs mean (ms) | Speedup × |
| --- | --- | --- | --- |
| 128_items_256_extra | 257.09 | 3.11 | 82.77 |
| 256_items_512_extra | 1377.24 | 8.51 | 161.86 |

Raw estimate JSON:
- `benchmarks/rank_centrality_baseline_2025-09-16.json` (dense-only baseline run)
- `benchmarks/rank_centrality_compare_2025-09-16.json` (dense vs sprs comparison)

The new `rank_centrality` Criterion group exercises both `rank_entities_dense` and `rank_entities_sparse`, so future iterations can detect regressions or improvements in either engine.
