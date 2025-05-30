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

#[derive(Serialize, Debug, Clone)] // Add Clone
pub struct RankedEntity {
    pub identifier: EntityIdentifier,
    pub score: f32,
}

// New Response structure - Changed unsorted to Vec<EntityIdentifier>
#[derive(Serialize, Debug)]
pub struct RankingResponse {
    unsorted: Vec<EntityIdentifier>, // Entities NOT ranked (owned)
    sorted: Vec<RankedEntity>,   // Entities that were ranked, sorted by score desc
}

// Represents a vote relevant to the input entities
#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct RelevantVote {
    pub left_entity_pk_namespace: String,
    pub left_entity_pk: String,
    pub right_entity_pk_namespace: String,
    pub right_entity_pk: String,
    // Assuming magnitude is stored as -50 to +50 in DB
    pub magnitude: i32,
}

// Internal struct to hold graph and mappings
pub struct RankGraph {
    // Map composite key "ns:pk" to graph index
    pub entity_key_to_index: HashMap<String, usize>,
    // Map graph index back to original identifier
    pub index_to_entity_identifier: HashMap<usize, EntityIdentifier>,
    pub graph: DirectedCsrGraph<usize, (), f32>, // Use usize index, f32 weight
}

// --- Graph Building ---

pub fn build_rank_graph(
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
    let graph: DirectedCsrGraph<usize, (), f32> = GraphBuilder::new()
        .edges_with_values(edges)
        .build();

    Ok(RankGraph {
        entity_key_to_index,
        index_to_entity_identifier,
        graph,
    })
}

// --- Tommy Rank Calculation ---

/// Alternative ranking implementation based on direct weights and max out-degree normalization.
pub fn calculate_tommy_rank(
    graph: &DirectedCsrGraph<usize, (), f32>,
    max_iters: usize,
    tol: f32,
) -> Vec<f32> {
    let node_count = graph.node_count();
    if node_count == 0 {
        return Vec::new();
    }

    // Calculate out-degrees for each node
    let out_degs: Vec<f32> = (0..node_count)
        .map(|u| graph.out_neighbors_with_values(u).map(|e| e.value).sum())
        .collect();

    // Find max out-degree
    let max_out_deg = out_degs.iter().fold(0.0f32, |max, &deg| max.max(deg));

    // Handle case where max_out_deg is zero (no edges or all weights zero)
    if max_out_deg <= 1e-9 { // Use epsilon comparison
        log::warn!("Max out-degree is zero, returning uniform scores.");
        // Python code initializes with 1s, but uniform seems safer for zero-degree case
        return vec![1.0 / node_count as f32; node_count];
    }

    // --- Iteration ---
    // Initialize scores with 1.0 as per Python code
    let mut scores = vec![1.0f32; node_count];

    for iter in 0..max_iters {
        let prev_scores = scores.clone(); // Copy previous scores
        let mut new_scores = vec![0.0f32; node_count];

        for i in 0..node_count {
            let out_degree = out_degs[i];
            // Self-loop weight calculation
            let self_loop = max_out_deg - out_degree;
            let total_deg = max_out_deg; // Normalization factor

            let current_score = prev_scores[i];

            // Distribute score to neighbors based on edge weights
            for edge in graph.out_neighbors_with_values(i) {
                let j = edge.target;
                let w_ij = edge.value;
                // Skip self-links in distribution loop (handled by self_loop)
                if i == j { continue }
                 if w_ij > 0.0 { // Ensure weight is positive before distributing
                      new_scores[j] += current_score * (w_ij / total_deg);
                 }
            }

            // Apply self-loop score contribution
            if self_loop > 0.0 { // Avoid division by zero if total_deg is zero (already checked)
                 new_scores[i] += current_score * (self_loop / total_deg);
            } else if total_deg <= 1e-9 && current_score > 0.0 {
                 // If node `i` has zero out-degree AND max_out_deg is zero (which means all nodes have zero out-degree),
                 // it should retain its score? The python code implies score vanishes if not distributed.
                 // Let's keep it simple: if total_deg is zero, score doesn't propagate.
                 // The check `max_out_deg <= 1e-9` at the start handles the graph-wide zero-degree case.
                 // If only *this* node `i` has out_deg=0 but others don't (so max_out_deg > 0),
                 // the self_loop = max_out_deg, and it retains its score contribution scaled by self_loop/total_deg = 1.0.
                 // This seems correct. The `if self_loop > 0.0` handles the case where out_degree == max_out_deg.
                 // Let's recalculate the self loop addition slightly differently for clarity.
                 // The code above already adds the self-loop correctly. Let's double-check the python:
                 // new_scores[i] += current_score * (self_loop / total_deg) -> Yes, this is correct.
            }
        }

        // Check convergence: sum(|scores - prev_scores|) < tol
        let diff: f32 = prev_scores.iter().zip(new_scores.iter()).map(|(p, n)| (p - n).abs()).sum();

        scores = new_scores; // Update scores

        if diff < tol {
            log::info!("Tommy Rank converged after {} iterations.", iter + 1);
            break; // Converged
        }

        // Check if max iterations reached
        if iter == max_iters - 1 {
            log::warn!(
                "Tommy Rank reached max_iters ({}) without converging. Diff = {}",
                max_iters, diff
            );
        }
    }

    // The Python code returns the scores without final normalization.
    scores
}

// --- Endpoint Handler ---

async fn rank_children_handler(
    State(state): State<AppState>,
    MaybeUser(maybe_user): MaybeUser,
    Json(payload): Json<Vec<EntityIdentifier>>,
) -> Result<impl IntoResponse, ErrorResponse> {
    if payload.is_empty() {
        return Ok(Json(RankingResponse { unsorted: vec![], sorted: vec![] }));
    }

    // Create a HashSet from the input payload for efficient lookup
    let initial_entities: HashSet<EntityIdentifier> = payload.iter().cloned().collect();

    // Prepare list of "ns:pk" keys for the query (from original payload)
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
            score as magnitude
        FROM votes
        WHERE (left_entity_pk_namespace || ':' || left_entity_pk) = ANY($1)
          AND (right_entity_pk_namespace || ':' || right_entity_pk) = ANY($1)
        -- Optional: Add voter_user_id filter if needed
        -- AND voter_user_id = $2
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

    // --- Identify entities involved in votes ---
    let mut voted_entities = HashSet::new();
    for vote in &votes {
        // Construct identifiers from vote parts
        let left_id = EntityIdentifier {
            pk_namespace: vote.left_entity_pk_namespace.clone(),
            pk: vote.left_entity_pk.clone(),
        };
        let right_id = EntityIdentifier {
            pk_namespace: vote.right_entity_pk_namespace.clone(),
            pk: vote.right_entity_pk.clone(),
        };

        // Add to set only if they were part of the original input payload
        if initial_entities.contains(&left_id) {
             voted_entities.insert(left_id);
        }
        if initial_entities.contains(&right_id) {
             voted_entities.insert(right_id);
        }
    }

    // --- Create list of UNSORTED (unranked) entities BEFORE moving payload ---
    let unsorted_list: Vec<EntityIdentifier> = payload
        .iter()
        .filter(|entity| !voted_entities.contains(*entity))
        .cloned() // Clone the entities to take ownership
        .collect();

    // --- Filter the original payload to include only voted entities ---
    let ranked_payload: Vec<EntityIdentifier> = payload
        .into_iter() // Consume original payload
        .filter(|entity| voted_entities.contains(entity))
        .collect();

    // If no entities are left after filtering (e.g., only isolated nodes in payload),
    // return the unsorted list and an empty sorted list.
    if ranked_payload.is_empty() {
         log::warn!("No entities involved in votes found among the input payload.");
         // Return the list of entities that were not ranked
         return Ok(Json(RankingResponse { unsorted: unsorted_list, sorted: vec![] }));
    }

    // Build the graph using only the entities involved in votes
    let rank_graph = match build_rank_graph(&ranked_payload, &votes) {
         Ok(rg) => rg,
         Err(e) => return Err(e), // Propagate error from graph building
    };

    let graph = &rank_graph.graph;
    let node_count = graph.node_count(); // Node count of the smaller graph

    // Check if graph is unexpectedly empty
    if node_count == 0 {
         log::error!("Graph is empty despite non-empty ranked_payload.");
         // Return the list of entities that were not ranked
         return Ok(Json(RankingResponse { unsorted: unsorted_list, sorted: vec![] }));
    }

    // --- Calculate Tommy Rank scores on the smaller graph ---
    let scores = calculate_tommy_rank(graph, 100000, 1e-8);

    // --- Combine identifiers with scores for the SORTED list ---
    let mut ranked_entities_list: Vec<RankedEntity> = Vec::with_capacity(node_count);
    for index in 0..node_count {
        if let Some(identifier) = rank_graph.index_to_entity_identifier.get(&index) {
             if let Some(&score) = scores.get(index) {
                  ranked_entities_list.push(RankedEntity {
                      identifier: identifier.clone(),
                      score,
                  });
             } else {
                  log::error!("Score missing for index {} in smaller graph", index);
             }
        } else {
             log::error!("Identifier missing for index {} in smaller graph", index);
        }
    }

    // Create the sorted list
    let mut sorted_list = ranked_entities_list;
    sorted_list.sort_unstable_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

    // Return both lists in the response structure
    Ok(Json(RankingResponse {
        unsorted: unsorted_list, // Already calculated
        sorted: sorted_list,
    }))
}

// --- Router Setup ---
pub fn routes() -> Router<AppState> {
    Router::new().route("/", post(rank_children_handler))
}

