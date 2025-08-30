use aide::axum::{
    ApiRouter,
    routing::{get_with, post_with},
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::NaiveDateTime;
use log::warn;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, IntoNotFound, Json, MapErrorSqlx},
};

#[derive(Serialize, Debug, sqlx::FromRow, JsonSchema)]
pub struct Vote {
    pub left_entity_pk_namespace: String,
    pub left_entity_pk: String,
    pub right_entity_pk_namespace: String,
    pub right_entity_pk: String,
    pub user_id: Uuid,
    pub magnitude: i32,
    pub attribute_id: i32,
    pub created_at: NaiveDateTime,
    pub deleted_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, JsonSchema)]
pub struct VotePath {
    left_ns: String,
    left_pk: String,
    right_ns: String,
    right_pk: String,
    user_id: Uuid,
    attr_id: i32,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct VotePayload {
    left_entity_pk_namespace: String,
    left_entity_pk: String,
    right_entity_pk_namespace: String,
    right_entity_pk: String,
    magnitude: i32,
    attribute_id: i32,
}

async fn create_vote(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<VotePayload>,
) -> Result<(StatusCode, Json<Vote>), Error> {
    let (left_ns, left_pk, right_ns, right_pk, magnitude) = if (
        payload.left_entity_pk_namespace.clone(),
        payload.left_entity_pk.clone(),
    ) < (
        payload.right_entity_pk_namespace.clone(),
        payload.right_entity_pk.clone(),
    ) {
        (
            payload.left_entity_pk_namespace,
            payload.left_entity_pk,
            payload.right_entity_pk_namespace,
            payload.right_entity_pk,
            payload.magnitude,
        )
    } else {
        (
            payload.right_entity_pk_namespace,
            payload.right_entity_pk,
            payload.left_entity_pk_namespace,
            payload.left_entity_pk,
            -payload.magnitude,
        )
    };

    let vote = sqlx::query_file_as!(
        Vote,
        "../database/sql/vote/insert.sql",
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        magnitude,
        payload.attribute_id,
        user.id,
    )
    .fetch_one(&state.db)
    .await
    .map_error("entity pair")?;

    Ok((StatusCode::CREATED, Json(vote)))
}

async fn get_vote(
    State(state): State<AppState>,
    Path(path): Path<VotePath>,
) -> Result<(StatusCode, Json<Vote>), Error> {
    let (query_left_ns, query_left_pk, query_right_ns, query_right_pk) = if (
        path.left_ns.clone(),
        path.left_pk.clone(),
    ) < (
        path.right_ns.clone(),
        path.right_pk.clone(),
    ) {
        (path.left_ns, path.left_pk, path.right_ns, path.right_pk)
    } else {
        warn!(left_ns = path.left_ns, left_pk = path.left_pk, right_ns = path.right_ns, right_pk = path.right_pk; "request path for get_vote received non-canonical order for pair");
        (path.left_ns, path.left_pk, path.right_ns, path.right_pk)
    };

    let vote = sqlx::query_file_as!(
        Vote,
        "../database/sql/vote/select.sql",
        query_left_ns,
        query_left_pk,
        query_right_ns,
        query_right_pk,
        path.user_id,
        path.attr_id
    )
    .fetch_optional(&state.db)
    .await
    .map_error("vote")?
    .catch_not_found("vote")?;

    Ok((StatusCode::OK, Json(vote)))
}

#[derive(Deserialize, Debug)]
struct VoteFilterParams {
    _user_id: Option<Uuid>,
    _attribute_id: Option<i32>,
    _parent_entity_ns: Option<String>,
    _parent_entity_pk: Option<String>,
}

#[derive(Deserialize, Debug, JsonSchema)]
struct VotesQueryParams {
    involved_entities: String,
}

async fn list_votes(State(state): State<AppState>) -> Result<(StatusCode, Json<Vec<Vote>>), Error> {
    let votes = sqlx::query_file_as!(Vote, "../database/sql/vote/list.sql",)
        .fetch_all(&state.db)
        .await
        .map_error("votes")?;

    Ok((StatusCode::OK, Json(votes)))
}

async fn get_votes_filtered(
    State(state): State<AppState>,
    Query(params): Query<VotesQueryParams>,
) -> Result<(StatusCode, Json<Vec<Vote>>), Error> {
    // Parse the involved_entities parameter (comma-separated list of namespace:pk)
    let entities: Vec<&str> = params.involved_entities.split(',').collect();

    if entities.is_empty() || entities.len() > 2 {
        return Err(Error::BadRequest {
            message: "involved_entities must contain 1 or 2 entities".into(),
        });
    }

    // Parse each entity identifier
    let mut parsed_entities = Vec::new();
    for entity_str in &entities {
        let parts: Vec<&str> = entity_str.split(':').collect();
        if parts.len() != 2 {
            return Err(Error::BadRequest {
                message: format!("Invalid entity identifier: {}", entity_str).into(),
            });
        }
        parsed_entities.push((parts[0].to_string(), parts[1].to_string()));
    }

    let votes = if parsed_entities.len() == 1 {
        // Single entity: find all votes involving this entity
        let (ns, pk) = &parsed_entities[0];
        sqlx::query_file_as!(
            Vote,
            "../database/sql/vote/list_for_entity.sql",
            ns,
            pk
        )
        .fetch_all(&state.db)
        .await
        .map_error("votes for entity")?
    } else {
        // Two entities: find votes between this specific pair
        let (left_ns, left_pk) = &parsed_entities[0];
        let (right_ns, right_pk) = &parsed_entities[1];

        // Ensure canonical ordering
        let (query_left_ns, query_left_pk, query_right_ns, query_right_pk) = if (
            left_ns.clone(),
            left_pk.clone(),
        ) < (
            right_ns.clone(),
            right_pk.clone(),
        ) {
            (left_ns.clone(), left_pk.clone(), right_ns.clone(), right_pk.clone())
        } else {
            (right_ns.clone(), right_pk.clone(), left_ns.clone(), left_pk.clone())
        };

        sqlx::query_file_as!(
            Vote,
            "../database/sql/vote/list_for_pair.sql",
            query_left_ns,
            query_left_pk,
            query_right_ns,
            query_right_pk
        )
        .fetch_all(&state.db)
        .await
        .map_error("votes for pair")?
    };

    Ok((StatusCode::OK, Json(votes)))
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route(
            "/",
            post_with(create_vote, |op| {
                op.description("Create a new vote.")
                    .response::<201, Json<Vote>>()
            })
            .get_with(list_votes, |op| {
                op.description("List all votes.")
                    .response::<200, Json<Vec<Vote>>>()
            }),
        )
        .api_route(
            "/filtered",
            get_with(get_votes_filtered, |op| {
                op.description("Get votes filtered by involved entities.")
                    .response::<200, Json<Vec<Vote>>>()
            }),
        )
        .api_route(
            "/{left_ns}/{left_pk}/{right_ns}/{right_pk}/{attr_id}",
            get_with(get_vote, |op| {
                op.description("Get a vote.").response::<200, Json<Vote>>()
            }),
        )
}
