use std::collections::{HashMap, HashSet};

use axum::{extract::State, http::StatusCode, response::IntoResponse, routing::post, Json, Router};
use graph::prelude::*;
use serde::{Deserialize, Serialize};

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
    // Use f32 if your DB type is REAL/FLOAT, adjust if it's INTEGER
    magnitude: f32,
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

        // Map magnitude from [-50, 50] to weight [0, 100] for PageRank logic
        // Ensure magnitude is clamped if it's outside the expected range
        let db_magnitude = vote.magnitude.clamp(-50.0, 50.0);
        let weight_left_wins = db_magnitude + 50.0; // L -> R edge weight
        let weight_right_wins = 100.0 - weight_left_wins; // R -> L edge weight

        // Add edges with weights, ensuring weight is non-negative
        edges.push((left_idx, right_idx, weight_left_wins));
        edges.push((right_idx, left_idx, weight_right_wins));
    }

    // Build the graph using usize indices
    let graph: DirectedCsrGraph<usize, (), f32> = GraphBuilder::new()
        .edges_with_values(edges)
        .build();

    Ok(RankGraph {
        entity_key_to_index,
        index_to_entity_identifier,
        graph,
    })
}

// --- PageRank Calculation (Adapted) ---

fn calculate_pagerank_iteration(
    graph: &DirectedCsrGraph<usize, (), f32>,
    scores: &mut Vec<f32>,
    out_weights: &[f32], // Total weight leaving each node
    damping_factor: f32,
) {
    let node_count = graph.node_count();
    let mut new_scores = vec![0.0; node_count];

    for u in 0..node_count {
        let total_out_weight = out_weights[u];

        // Distribute score to neighbors based on edge weights
        for edge in graph.out_neighbors_with_values(u) {
             let v = edge.target;
             let weight = edge.value;
             if total_out_weight > 0.0 {
                  new_scores[v] += scores[u] * (weight / total_out_weight);
             } else {
                 // Handle dangling nodes (no outgoing weight): distribute score evenly?
                 // Or let it vanish? Standard PageRank adds a jump probability.
                 // For now, let score vanish from dangling nodes in this iteration step.
             }
        }

        // If node `u` has no outgoing edges, its score doesn't propagate in this step
        // unless we add the jump mechanism.
    }

    // Apply damping factor and add jump probability (teleportation)
    let jump_prob = (1.0 - damping_factor) / node_count as f32;
    let damped_sum: f32 = new_scores.iter().sum(); // This sum represents the score propagated via links

    for i in 0..node_count {
         // The new score is a combination of score from incoming links (scaled by damping factor)
         // and the base probability of jumping to this node.
         // Note: The sum of new_scores before this loop isn't necessarily 1.0 if there were dangling nodes.
         // A common formulation adjusts: score = damping * received_score + (1 - damping) / N
         // Or alternatively, add the leaked rank back:
         // score = damping * received_score + (1 - current_total_rank_mass) / N + (1-damping)/N ??? -- complex

         // Let's use the simple formulation:
         new_scores[i] = jump_prob + damping_factor * new_scores[i];
    }

     // Renormalize scores to sum to 1.0 (optional, but good practice)
    let total_score: f32 = new_scores.iter().sum();
    if total_score > 0.0 {
         for score in new_scores.iter_mut() {
              *score /= total_score;
         }
    }


    *scores = new_scores;
}


fn calculate_pagerank(graph: &DirectedCsrGraph<usize, (), f32>, iterations: usize, damping_factor: f32) -> Vec<f32> {
    let node_count = graph.node_count();
    if node_count == 0 {
        return Vec::new();
    }

    // Calculate total outgoing weight for each node
    let mut out_weights = vec![0.0; node_count];
    for node in 0..node_count {
        out_weights[node] = graph.out_neighbors_with_values(node).map(|e| e.value).sum();
    }

    // Initialize scores uniformly
    let init_score = 1.0 / node_count as f32;
    let mut scores = vec![init_score; node_count];

    // Run iterations
    for _ in 0..iterations {
        calculate_pagerank_iteration(graph, &mut scores, &out_weights, damping_factor);
    }

    scores
}

// --- Endpoint Handler ---

async fn rank_children_handler(
    State(state): State<AppState>,
    MaybeUser(maybe_user): MaybeUser, // Use MaybeUser or enforce auth with Extension<User>
    Json(payload): Json<Vec<EntityIdentifier>>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // --- Optional: Authentication Check ---
    // If ranking should be user-specific or require login:
    // let user = maybe_user.ok_or_else(|| ErrorResponse::unauthorized("Authentication required"))?;

    if payload.is_empty() {
        return Ok(Json(Vec::<RankedEntity>::new()));
    }

    // Prepare list of "ns:pk" keys for the query
    let entity_keys: Vec<String> = payload
        .iter()
        .map(|e| format!("{}:{}", e.pk_namespace, e.pk))
        .collect();

    // Fetch relevant votes from the database
    // TODO: Add filter for attribute_id if needed (e.g., WHERE attribute_id = 1 for 'like')
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
        -- Optional: Add user_id filter if ranking is user-specific
        -- AND user_id = $2
        "#,
        &entity_keys // Pass the array of keys
        // user.id // Pass user_id if filtering by user
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            log::error!("Failed to fetch votes for ranking: {}", e);
            return Err(ErrorResponse::internal_server_error(
                "Database error while fetching votes",
            ));
        }
    };

    // Build the graph
    let rank_graph = build_rank_graph(&payload, &votes)?;

    // Calculate PageRank scores
    // Common values: iterations=100, damping_factor=0.85
    let scores = calculate_pagerank(&rank_graph.graph, 100, 0.85);

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

    Ok((StatusCode::OK, Json(ranked_entities)))
}

// --- Router Setup ---
pub fn routes() -> Router<AppState> {
    Router::new().route("/rank/children", post(rank_children_handler))
    // Add other pagerank related routes here if needed
}

