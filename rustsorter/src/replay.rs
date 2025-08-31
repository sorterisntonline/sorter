use aide::axum::{
    routing::get_with,
    ApiRouter,
};
use axum::{
    extract::Path,
};
use chrono::NaiveDateTime;
use schemars::JsonSchema;
use serde::Serialize;
use sqlx::types::Uuid;
use std::collections::HashSet;

use crate::{
    app_state::AppState,
    models::{Error, Json, MapErrorSqlx},
    pagerank::{self, RankedEntity, EntityIdentifier},
};

#[derive(Serialize, Debug, Clone, sqlx::FromRow, JsonSchema)]
pub struct Vote {
    pub left_entity_pk_namespace: String,
    pub left_entity_pk: String,
    pub right_entity_pk_namespace: String,
    pub right_entity_pk: String,
    pub user_id: Uuid,
    pub magnitude: i32,
    pub rationale: Option<String>,
    pub attribute_id: i32,
    pub created_at: NaiveDateTime,
    pub deleted_at: Option<NaiveDateTime>,
}

#[derive(Serialize, JsonSchema)]
pub struct HistoryStep {
    // The vote that was just processed to produce this state
    pub vote_added: Vote,
    // The state of the rankings after this vote
    pub current_rankings: Vec<RankedEntity>,
    pub unsorted_items: Vec<EntityIdentifier>,
}

#[derive(Serialize, JsonSchema)]
pub struct ReplayResponse {
    // A simple list of all unique item Pks involved in this run
    pub items: Vec<EntityIdentifier>,
    // The step-by-step history of the ranking evolution
    pub history: Vec<HistoryStep>,
}

#[derive(sqlx::FromRow, Debug)]
struct RelevantVote {
    left_entity_pk_namespace: String,
    left_entity_pk: String,
    right_entity_pk_namespace: String,
    right_entity_pk: String,
    magnitude: i32,
    created_at: NaiveDateTime,
    rationale: Option<String>,
}

pub async fn calculate_run_history(
    state: &AppState,
    run_id: &str,
) -> Result<ReplayResponse, Error> {
    // 1. Find all `gitsort.branch_snapshot` entities for this run_id
    let snapshots = sqlx::query_file_as!(
        EntityIdentifier,
        "../database/sql/entity/select_children_identifiers.sql",
        "gitsort.run",
        run_id,
        "gitsort.branch_snapshot"
    )
    .fetch_all(&state.db).await.map_error("run snapshots")?;

    if snapshots.is_empty() {
        return Ok(ReplayResponse { items: vec![], history: vec![] });
    }

    // 2. Fetch all votes between these specific snapshots, ordered by time
    let snapshot_keys: Vec<String> = snapshots.iter().map(|s| format!("{}:{}", s.pk_namespace, s.pk)).collect();
    let all_votes = sqlx::query_file_as!(
        RelevantVote,
        "../database/sql/vote/select_for_history.sql",
        &snapshot_keys
    )
    .fetch_all(&state.db).await.map_error("run votes")?;

    let mut history: Vec<HistoryStep> = Vec::new();
    let mut votes_processed: Vec<&RelevantVote> = Vec::new();

    // 3. Loop through votes chronologically, recalculating rank at each step
    for vote in &all_votes {
        votes_processed.push(vote);

        // Convert vote slice back to format needed for pagerank::build_rank_graph
        let relevant_votes_for_ranker: Vec<pagerank::RelevantVote> = votes_processed.iter().map(|v| {
            pagerank::RelevantVote {
                left_entity_pk_namespace: v.left_entity_pk_namespace.clone(),
                left_entity_pk: v.left_entity_pk.clone(),
                right_entity_pk_namespace: v.right_entity_pk_namespace.clone(),
                right_entity_pk: v.right_entity_pk.clone(),
                magnitude: v.magnitude,
                rationale: v.rationale.clone(),
            }
        }).collect();

        // Calculate ranking for current set of votes
        let ranking_result = calculate_ranking_for_entities(&snapshots, &relevant_votes_for_ranker).await?;

        // Convert the vote to our Vote struct for the response
        let vote_for_response = Vote {
            left_entity_pk_namespace: vote.left_entity_pk_namespace.clone(),
            left_entity_pk: vote.left_entity_pk.clone(),
            right_entity_pk_namespace: vote.right_entity_pk_namespace.clone(),
            right_entity_pk: vote.right_entity_pk.clone(),
            user_id: Uuid::nil(), // We don't have this in RelevantVote, set to nil
            magnitude: vote.magnitude,
            rationale: vote.rationale.clone(), // Use the actual rationale from the vote
            attribute_id: 1, // Default attribute
            created_at: vote.created_at,
            deleted_at: None,
        };

        let step = HistoryStep {
            vote_added: vote_for_response,
            current_rankings: ranking_result.sorted,
            unsorted_items: ranking_result.unsorted,
        };
        history.push(step);
    }

    Ok(ReplayResponse {
        items: snapshots,
        history,
    })
}

async fn calculate_ranking_for_entities(
    entities: &[EntityIdentifier],
    votes: &[pagerank::RelevantVote],
) -> Result<pagerank::RankingResponse, Error> {
    if entities.is_empty() {
        return Ok(pagerank::RankingResponse {
            unsorted: vec![],
            sorted: vec![],
        });
    }

    let initial_entities: HashSet<EntityIdentifier> = entities.iter().cloned().collect();

    let mut voted_entities = HashSet::new();
    for vote in votes {
        let left_id = EntityIdentifier {
            pk_namespace: vote.left_entity_pk_namespace.clone(),
            pk: vote.left_entity_pk.clone(),
        };
        let right_id = EntityIdentifier {
            pk_namespace: vote.right_entity_pk_namespace.clone(),
            pk: vote.right_entity_pk.clone(),
        };

        if initial_entities.contains(&left_id) {
            voted_entities.insert(left_id);
        }
        if initial_entities.contains(&right_id) {
            voted_entities.insert(right_id);
        }
    }

    let unsorted_list: Vec<EntityIdentifier> = entities
        .iter()
        .filter(|entity| !voted_entities.contains(*entity))
        .cloned()
        .collect();

    let ranked_payload: Vec<EntityIdentifier> = entities
        .iter()
        .filter(|entity| voted_entities.contains(entity))
        .cloned()
        .collect();

    if ranked_payload.is_empty() {
        return Ok(pagerank::RankingResponse {
            unsorted: unsorted_list,
            sorted: vec![],
        });
    }

    let rank_graph = pagerank::build_rank_graph(&ranked_payload, votes)?;

    let scores = pagerank::calculate_rank_centrality(&rank_graph.graph, 100000, 1e-8);
    let node_count = rank_graph.index_to_entity_identifier.len();

    if node_count == 0 {
        return Ok(pagerank::RankingResponse {
            unsorted: unsorted_list,
            sorted: vec![],
        });
    }

    let mut ranked_entities_list: Vec<pagerank::RankedEntity> = Vec::with_capacity(node_count);
    for index in 0..node_count {
        let Some(identifier) = rank_graph.index_to_entity_identifier.get(&index) else {
            continue;
        };
        let Some(&score) = scores.get(index) else {
            continue;
        };
        ranked_entities_list.push(pagerank::RankedEntity {
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

    Ok(pagerank::RankingResponse {
        unsorted: unsorted_list,
        sorted: sorted_list,
    })
}

async fn get_run_history_handler(
    state: axum::extract::State<AppState>,
    Path(run_id): Path<String>
) -> Result<Json<ReplayResponse>, Error> {
    let history = calculate_run_history(&state, &run_id).await?;
    Ok(Json(history))
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route(
            "/{run_id}/history",
            get_with(get_run_history_handler, |op| {
                op.description("Get the full ranking history for a run.")
            })
        )
}
