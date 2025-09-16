use criterion::{BenchmarkId, Criterion, black_box, criterion_group, criterion_main};
use rand::{Rng, SeedableRng, seq::SliceRandom};
use rustsorter::{EntityIdentifier, RelevantVote, rank_entities_dense, rank_entities_sparse};

fn make_entities(count: usize, namespace: &str) -> Vec<EntityIdentifier> {
    (0..count)
        .map(|i| EntityIdentifier {
            pk_namespace: namespace.to_string(),
            pk: i.to_string(),
        })
        .collect()
}

fn add_comparison(i: usize, j: usize, matrix: &mut [Vec<f64>]) {
    let weight = (j + 1) as f64 / (i + j + 2) as f64;
    matrix[i][j] += weight;
    matrix[j][i] += 1.0 - weight;
}

fn make_comparison_matrix(n: usize, extra_comparisons: usize, rng: &mut impl Rng) -> Vec<Vec<f64>> {
    let mut matrix = vec![vec![0.0_f64; n]; n];
    let mut perm: Vec<usize> = (0..n).collect();
    perm.shuffle(rng);

    for k in 1..n {
        let i = perm[..k].choose(rng).copied().unwrap_or(0);
        let j = perm[k];
        add_comparison(i, j, &mut matrix);
    }

    for _ in 0..extra_comparisons {
        let i = rng.gen_range(0..n);
        let offset = rng.gen_range(1..n);
        let j = (i + offset) % n;
        add_comparison(i, j, &mut matrix);
    }

    matrix
}

fn matrix_to_votes(matrix: &[Vec<f64>], namespace: &str) -> Vec<RelevantVote> {
    let n = matrix.len();
    let mut votes = Vec::new();

    for i in 0..n {
        for j in (i + 1)..n {
            let a_ij = matrix[i][j];
            let a_ji = matrix[j][i];
            let total = a_ij + a_ji;
            if total <= f64::EPSILON {
                continue;
            }

            let left_prob = a_ji / total;
            let magnitude = ((0.5 - left_prob) * 100.0).round() as i32;
            votes.push(RelevantVote {
                left_entity_pk_namespace: namespace.to_string(),
                left_entity_pk: i.to_string(),
                right_entity_pk_namespace: namespace.to_string(),
                right_entity_pk: j.to_string(),
                magnitude: magnitude.clamp(-50, 50),
            });
        }
    }

    votes
}

fn bench_rank_entities(c: &mut Criterion) {
    let namespace = "bench";
    let mut group = c.benchmark_group("rank_centrality");
    let scenarios = [(128_usize, 256_usize), (256_usize, 512_usize)];

    for (item_count, extra) in scenarios {
        let entities = make_entities(item_count, namespace);
        let mut rng = rand::rngs::StdRng::seed_from_u64(42);
        let matrix = make_comparison_matrix(item_count, extra, &mut rng);
        let votes = matrix_to_votes(&matrix, namespace);

        group.bench_function(
            BenchmarkId::new("dense", format!("{item_count}_items_{extra}_extra")),
            |b| {
                b.iter(|| {
                    let _ = rank_entities_dense(black_box(&entities), black_box(&votes)).unwrap();
                });
            },
        );

        group.bench_function(
            BenchmarkId::new("sprs", format!("{item_count}_items_{extra}_extra")),
            |b| {
                b.iter(|| {
                    let _ = rank_entities_sparse(black_box(&entities), black_box(&votes)).unwrap();
                });
            },
        );
    }

    group.finish();
}

criterion_group!(ranking, bench_rank_entities);
criterion_main!(ranking);
