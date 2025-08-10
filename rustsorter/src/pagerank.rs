use std::collections::{HashMap, HashSet};

use aide::axum::{ApiRouter, routing::post_with};
use axum::extract::State;
use graph::prelude::*;
use log::{error, info, warn};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    app_state::AppState,
    models::{Error, Json, MapErrorSqlx},
};

#[derive(Deserialize, Debug, Clone, PartialEq, Eq, Hash, Serialize, JsonSchema)]
pub struct EntityIdentifier {
    pub ns: String,
    pub pk: String,
}

#[derive(Serialize, Debug, Clone, JsonSchema)]
pub struct RankedEntity {
    pub identifier: EntityIdentifier,
    pub score: f32,
}

#[derive(Serialize, Debug, JsonSchema)]
pub struct RankingResponse {
    unsorted: Vec<EntityIdentifier>,
    sorted: Vec<RankedEntity>,
}

#[derive(sqlx::FromRow, Debug)]
struct RelevantVote {
    left_entity_ns: String,
    left_entity_pk: String,
    right_entity_ns: String,
    right_entity_pk: String,

    magnitude: i32,
}

struct RankGraph {
    _entity_key_to_index: HashMap<String, usize>,

    index_to_entity_identifier: HashMap<usize, EntityIdentifier>,
    graph: DirectedCsrGraph<usize, (), f32>,
}

fn build_rank_graph(
    entities: &[EntityIdentifier],
    votes: &[RelevantVote],
) -> Result<RankGraph, Error> {
    let mut entity_key_to_index = HashMap::new();
    let mut index_to_entity_identifier = HashMap::new();
    let mut edges = Vec::new();
    let mut node_count = 0;

    for entity in entities {
        let key = format!("{}:{}", entity.ns, entity.pk);
        if !entity_key_to_index.contains_key(&key) {
            entity_key_to_index.insert(key.clone(), node_count);
            index_to_entity_identifier.insert(node_count, entity.clone());
            node_count += 1;
        }
    }

    for vote in votes {
        let left_key = format!("{}:{}", vote.left_entity_ns, vote.left_entity_pk);
        let right_key = format!(
            "{}:{}",
            vote.right_entity_ns, vote.right_entity_pk
        );

        let Some(&left_idx) = entity_key_to_index.get(&left_key) else {
            continue;
        };
        let Some(&right_idx) = entity_key_to_index.get(&right_key) else {
            continue;
        };

        let db_magnitude = (vote.magnitude as f32).clamp(-50.0, 50.0);
        let weight_left_wins = db_magnitude + 50.0;
        let weight_right_wins = 100.0 - weight_left_wins;

        edges.push((left_idx, right_idx, weight_left_wins));
        edges.push((right_idx, left_idx, weight_right_wins));
    }

    let graph: DirectedCsrGraph<usize, (), f32> =
        GraphBuilder::new().edges_with_values(edges).build();

    Ok(RankGraph {
        _entity_key_to_index: entity_key_to_index,
        index_to_entity_identifier,
        graph,
    })
}

fn calculate_rank_centrality(
    graph: &DirectedCsrGraph<usize, (), f32>,
    max_iters: usize,
    tol: f32,
) -> Vec<f32> {
    let node_count = graph.node_count();
    if node_count == 0 {
        return Vec::new();
    }

    let out_degs: Vec<f32> = (0..node_count)
        .map(|u| graph.out_neighbors_with_values(u).map(|e| e.value).sum())
        .collect();

    let max_out_deg = out_degs.iter().fold(0.0f32, |max, &deg| max.max(deg));

    if max_out_deg <= 1e-9 {
        warn!("Max out-degree is zero, returning uniform scores.");

        return vec![1.0 / node_count as f32; node_count];
    }

    let mut scores = vec![1.0f32; node_count];

    for iter in 0..max_iters {
        let prev_scores = scores.clone();
        let mut new_scores = vec![0.0f32; node_count];

        for i in 0..node_count {
            let out_degree = out_degs[i];

            let self_loop = max_out_deg - out_degree;
            let total_deg = max_out_deg;

            let current_score = prev_scores[i];

            for edge in graph.out_neighbors_with_values(i) {
                let j = edge.target;
                let w_ij = edge.value;

                if i == j {
                    continue;
                }
                if w_ij > 0.0 {
                    new_scores[j] += current_score * (w_ij / total_deg);
                }
            }

            if self_loop > 0.0 {
                new_scores[i] += current_score * (self_loop / total_deg);
            } else if total_deg <= 1e-9 && current_score > 0.0 {
                // TODO: handle this case
            }
        }

        let diff: f32 = prev_scores
            .iter()
            .zip(new_scores.iter())
            .map(|(p, n)| (p - n).abs())
            .sum();

        scores = new_scores;

        if diff < tol {
            info!(iterations = iter + 1; "tommy Rank converged");
            break;
        }

        if iter == max_iters - 1 {
            warn!(
                max_iters,
                diff;
                "tommy Rank reached max_iters without converging",
            );
        }
    }

    scores
}

async fn rank_children_handler(
    State(state): State<AppState>,
    Json(payload): Json<Vec<EntityIdentifier>>,
) -> Result<Json<RankingResponse>, Error> {
    if payload.is_empty() {
        return Ok(Json(RankingResponse {
            unsorted: vec![],
            sorted: vec![],
        }));
    }

    let initial_entities: HashSet<EntityIdentifier> = payload.iter().cloned().collect();

    let entity_keys: Vec<String> = payload
        .iter()
        .map(|e| format!("{}:{}", e.ns, e.pk))
        .collect();

    let votes = sqlx::query_file_as!(
        RelevantVote,
        "../database/sql/vote/select_partial.sql",
        &entity_keys
    )
    .fetch_all(&state.db)
    .await
    .map_error("votes")?;

    let mut voted_entities = HashSet::new();
    for vote in &votes {
        let left_id = EntityIdentifier {
            ns: vote.left_entity_ns.clone(),
            pk: vote.left_entity_pk.clone(),
        };
        let right_id = EntityIdentifier {
            ns: vote.right_entity_ns.clone(),
            pk: vote.right_entity_pk.clone(),
        };

        if initial_entities.contains(&left_id) {
            voted_entities.insert(left_id);
        }
        if initial_entities.contains(&right_id) {
            voted_entities.insert(right_id);
        }
    }

    let unsorted_list: Vec<EntityIdentifier> = payload
        .iter()
        .filter(|entity| !voted_entities.contains(*entity))
        .cloned()
        .collect();

    let ranked_payload: Vec<EntityIdentifier> = payload
        .into_iter()
        .filter(|entity| voted_entities.contains(entity))
        .collect();

    if ranked_payload.is_empty() {
        warn!("no entities involved in votes found among the input payload");

        return Ok(Json(RankingResponse {
            unsorted: unsorted_list,
            sorted: vec![],
        }));
    }

    let rank_graph = build_rank_graph(&ranked_payload, &votes)?;

    let graph = &rank_graph.graph;
    let node_count = graph.node_count();

    if node_count == 0 {
        error!("graph is empty despite non-empty ranked_payload");

        return Ok(Json(RankingResponse {
            unsorted: unsorted_list,
            sorted: vec![],
        }));
    }

    let scores = calculate_rank_centrality(graph, 100000, 1e-8);

    let mut ranked_entities_list: Vec<RankedEntity> = Vec::with_capacity(node_count);
    for index in 0..node_count {
        let Some(identifier) = rank_graph.index_to_entity_identifier.get(&index) else {
            error!(index; "identifier missing for index in smaller graph");
            continue;
        };
        let Some(&score) = scores.get(index) else {
            error!(index; "score missing for index in smaller graph");
            continue;
        };
        ranked_entities_list.push(RankedEntity {
            identifier: identifier.clone(),
            score,
        });
    }

    let mut sorted_list = ranked_entities_list;
    sorted_list.sort_unstable_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(Json(RankingResponse {
        unsorted: unsorted_list,
        sorted: sorted_list,
    }))
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route(
        "/",
        post_with(rank_children_handler, |op| {
            op.description("Rank children of a given entity.")
                .response::<200, Json<RankingResponse>>()
        }),
    )
}
