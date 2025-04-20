use std::collections::{HashMap, HashSet};

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use graph::prelude::*;
use serde::{Deserialize, Serialize};
// Add itertools if needed for complex iterations, but let's try without first
// use itertools::Itertools;

use crate::{
    app_state::AppState,
    models::{ErrorResponse, User}, // Assuming User might be needed later for auth checks
};
use crate::extractors::maybe_user::MaybeUser; // Assuming auth context

// --- Data Structures ---

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Hash, Serialize)]
pub struct EntityIdentifier {
    pub pk_namespace: String,
    pub pk: String,
}

#[derive(Serialize, Debug)]
pub struct RankedEntity {
    #[serde(flatten)] // Include ns and pk directly
    pub identifier: EntityIdentifier,
    pub score: f32,
}

// Represents a vote relevant to the input entities
#[derive(sqlx::FromRow, Debug)]
struct RelevantVote {
    left_entity_pk_namespace: String,
    left_entity_pk: String,
    right_entity_pk_namespace: String,
    right_entity_pk: String,
    // Assuming magnitude is stored as -50 to +50 in DB
    magnitude: i32,
}

// Internal struct to hold graph and mappings
struct RankGraph {
    // Map composite key "ns:pk" to graph index
    entity_key_to_index: HashMap<String, usize>,
    // Map graph index back to original identifier
    index_to_entity_identifier: HashMap<usize, EntityIdentifier>,
    graph: DirectedCsrGraph<usize, (), f32>, // Use usize index, f32 weight
}

// --- Graph Building ---

fn build_rank_graph(
    entities: &[EntityIdentifier],
    votes: &[RelevantVote],
) -> Result<RankGraph, ErrorResponse> {
    let mut entity_key_to_index = HashMap::new();
    let mut index_to_entity_identifier = HashMap::new();
    let mut edges = Vec::new();
    let mut node_count = 0;

    // Create mappings for all input entities first
    for entity in entities {
        let key = format!("{}:{}", entity.pk_namespace, entity.pk);
        if !entity_key_to_index.contains_key(&key) {
            entity_key_to_index.insert(key.clone(), node_count);
            index_to_entity_identifier.insert(node_count, entity.clone());
            node_count += 1;
        }
    }

    // Process votes to create edges
    for vote in votes {
        let left_key = format!("{}:{}", vote.left_entity_pk_namespace, vote.left_entity_pk);
        let right_key = format!("{}:{}", vote.right_entity_pk_namespace, vote.right_entity_pk);

        // Get indices, skip vote if an entity wasn't in the input list (shouldn't happen with correct query)
        let Some(&left_idx) = entity_key_to_index.get(&left_key) else { continue };
        let Some(&right_idx) = entity_key_to_index.get(&right_key) else { continue };

        // Map magnitude from [-50, 50] to weight [0, 100]
        // weight_left_wins (w_LR) represents how much Left beats Right
        // weight_right_wins (w_RL) represents how much Right beats Left
        // w_LR + w_RL = 100
        let db_magnitude = (vote.magnitude as f32).clamp(-50.0, 50.0);
        let weight_left_wins = db_magnitude + 50.0; // L -> R edge weight
        let weight_right_wins = 100.0 - weight_left_wins; // R -> L edge weight

        // Add edges: edge (u, v, w_uv) means u beats v with weight w_uv
        edges.push((left_idx, right_idx, weight_left_wins));
        edges.push((right_idx, left_idx, weight_right_wins));
    }

    // Build the graph using usize indices
    // Note: Ensure the graph crate supports accessing edge weights later.
    // If duplicates edges are added (e.g., multiple votes between same pair),
    // the builder might sum them or take the last one. Check graph crate behavior.
    // Assuming sum/average is not needed based on Python code.
    let graph: DirectedCsrGraph<usize, (), f32> = GraphBuilder::new()
        .edges_with_values(edges)
        .build();

    Ok(RankGraph {
        entity_key_to_index,
        index_to_entity_identifier,
        graph,
    })
}

// --- Rank Centrality Calculation ---

/// Calculates rank centrality based on pairwise comparisons.
///
/// A_ij = times j beat i. Corresponds to w_ji (weight of edge j -> i)
/// W_ij = A_ij / (A_ij + A_ji) = w_ji / (w_ji + w_ij) = w_ji / 100.0
/// P_ij = W_ij / w_max (for i != j) = w_ji / (100.0 * w_max)
/// P_ii = 1 - sum(P_ik for k != i) = 1 - sum(W_ik / w_max for k!=i) = 1 - sum(w_ki / (100.0 * w_max) for k!=i)
/// Iteration: new_scores[j] = sum_i (prev_scores[i] * P_ij)
///           new_scores[j] = prev_scores[j] * P_jj + sum_{i != j} (prev_scores[i] * P_ij)
///           new_scores[j] = prev_scores[j] * P_jj + sum_{i: edge j->i exists} (prev_scores[i] * w_ji / (100.0 * w_max))
fn calculate_rank_centrality(
    graph: &DirectedCsrGraph<usize, (), f32>,
    max_iters: usize,
    tol: f32,
) -> Vec<f32> {
    let node_count = graph.node_count();
    if node_count == 0 {
        return Vec::new();
    }

    // --- Calculate w_max and P_ii components ---
    // w_max = max over i of sum(W[i, k] for k != i)
    // W[i, k] = w_ki / 100.0 (where w_ki is edge k -> i)
    // We need incoming edge weights for each node i.
    // Build an incoming adjacency list representation temporarily.
    let mut incoming_weights: HashMap<usize, HashMap<usize, f32>> = HashMap::new();
    for u in 0..node_count {
        for edge in graph.out_neighbors_with_values(u) {
            let v = edge.target;
            let w_uv = edge.value;
            incoming_weights.entry(v).or_default().insert(u, w_uv);
        }
    }

    let mut w_max = 0.0f32;
    // Stores sum(W[i, k] for k!=i) for each i
    let mut w_row_sums = vec![0.0; node_count];
    for i in 0..node_count {
        let mut row_sum_w = 0.0;
        if let Some(in_edges) = incoming_weights.get(&i) {
            for (k, w_ki) in in_edges.iter() {
                 // W[i, k] = w_ki / 100.0
                 row_sum_w += w_ki / 100.0;
            }
        }
        w_row_sums[i] = row_sum_w;
        w_max = w_max.max(row_sum_w);
    }

    // Calculate P_ii for each node i
    // P_ii = 1 - sum(W[i, k] / w_max for k!=i) = 1 - w_row_sums[i] / w_max
    let p_diag: Vec<f32> = w_row_sums.iter().map(|&sum_w| 1.0 - sum_w / w_max).collect();


    // --- Iteration ---
    let mut scores = vec![1.0 / node_count as f32; node_count];

    for iter in 0..max_iters {
        let prev_scores = scores.clone(); // Copy previous scores
        let mut new_scores = vec![0.0; node_count];

        // Calculate new_scores[j] = prev_scores[j] * P_jj + sum_{i: edge j->i exists} (prev_scores[i] * w_ji / (100.0 * w_max))
        for j in 0..node_count {
            let p_jj = p_diag[j]; // P[j, j]

            // Calculate sum term using outgoing edges from j
            let mut outgoing_sum = 0.0;
            // edge j -> i has weight w_ji
            for edge in graph.out_neighbors_with_values(j) {
                let i = edge.target;
                let w_ji = edge.value;
                // Term is prev_scores[i] * P[i, j] where P[i,j] = W[i,j]/w_max = w_ji / (100.0 * w_max)
                // This interpretation seems wrong based on the formula derivation above.
                // Let's re-verify: new_scores[j] = sum_i (prev_scores[i] * P_ij)

                // Let's compute new_scores column by column (j)
                // Iterate through all potential sources i
                // Need P_ij = w_ji / (100.0 * w_max) for i != j
                // Need P_jj = p_diag[j]

                // Revised inner loop: Iterate i, calculate P_ij, add prev_scores[i] * P_ij to new_scores[j]
                // This seems O(N^2) again.

                // Let's use the formula derived before the code block:
                // new_scores[j] = prev_scores[j] * P_jj + sum_{i: edge j->i exists} (prev_scores[i] * w_ji / (100.0 * w_max))
                // Seems correct. The sum is over targets `i` of outgoing edges from `j`.
                 outgoing_sum += prev_scores[i] * w_ji / (100.0 * w_max);

            }

            new_scores[j] = prev_scores[j] * p_jj + outgoing_sum;
        }


        // Check convergence: sum(|scores - prev_scores|) < tol
        let diff: f32 = prev_scores.iter().zip(new_scores.iter()).map(|(p, n)| (p - n).abs()).sum();

        scores = new_scores; // Update scores

        if diff < tol {
            log::info!("Rank centrality converged after {} iterations.", iter + 1);
            break; // Converged
        }

        // Check if max iterations reached
        if iter == max_iters - 1 {
            log::warn!(
                "Rank centrality reached max_iters ({}) without converging. Diff = {}",
                max_iters, diff
            );
        }
    }

    // The Python code implies the scores sum approximately to 1, but doesn't explicitly normalize.
    // We will also skip explicit normalization to match.
    scores
}

// --- Endpoint Handler ---

async fn rank_children_handler(
    State(state): State<AppState>,
    MaybeUser(maybe_user): MaybeUser,
    Json(payload): Json<Vec<EntityIdentifier>>,
) -> Result<impl IntoResponse, ErrorResponse> {
    if payload.is_empty() {
        return Ok(Json(Vec::<RankedEntity>::new()));
    }

    let entity_keys: Vec<String> = payload
        .iter()
        .map(|e| format!("{}:{}", e.pk_namespace, e.pk))
        .collect();

    // Fetch relevant votes
    let votes = match sqlx::query_as!(
        RelevantVote,
        r#"
        SELECT
            left_entity_pk_namespace, left_entity_pk,
            right_entity_pk_namespace, right_entity_pk,
            magnitude
        FROM votes
        WHERE (left_entity_pk_namespace || ':' || left_entity_pk) = ANY($1)
          AND (right_entity_pk_namespace || ':' || right_entity_pk) = ANY($1)
        -- Optional: Add user_id filter if needed
        -- AND user_id = $2
        "#,
        &entity_keys
        // user.id // Example if user needed
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            log::error!("Failed to fetch votes for ranking: {}", e);
            return Err(ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error while fetching votes".to_string()));
        }
    };

    // Build the graph
    let rank_graph = match build_rank_graph(&payload, &votes) {
         Ok(rg) => rg,
         Err(e) => return Err(e), // Propagate error from graph building
    };

    // Check if graph is empty after filtering votes
    if rank_graph.graph.node_count() == 0 {
         log::warn!("Graph is empty after processing votes, returning empty ranking.");
         return Ok(Json(Vec::<RankedEntity>::new()));
    }


    // Calculate Rank Centrality scores
    // Using defaults from Python code: tol=1e-8, max_iters=100000
    let scores = calculate_rank_centrality(&rank_graph.graph, 100000, 1e-8);

    // Combine identifiers with scores
    let mut ranked_entities: Vec<RankedEntity> = scores
        .into_iter()
        .enumerate()
        .filter_map(|(index, score)| {
            rank_graph
                .index_to_entity_identifier
                .get(&index)
                .map(|identifier| RankedEntity {
                    identifier: identifier.clone(),
                    score,
                })
        })
        .collect();

    // Sort by score descending
    ranked_entities.sort_unstable_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    Ok(Json(ranked_entities))
}

// --- Router Setup ---
pub fn routes() -> Router<AppState> {
    Router::new().route("/", post(rank_children_handler))
}

