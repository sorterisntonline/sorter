use aide::axum::{
    ApiRouter,
    routing::{get_with, post_with},
};
use axum::{
    extract::{Path, State},
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

async fn list_votes(State(state): State<AppState>) -> Result<(StatusCode, Json<Vec<Vote>>), Error> {
    let votes = sqlx::query_file_as!(Vote, "../database/sql/vote/list.sql",)
        .fetch_all(&state.db)
        .await
        .map_error("votes")?;

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
            "/{left_ns}/{left_pk}/{right_ns}/{right_pk}/{attr_id}",
            get_with(get_vote, |op| {
                op.description("Get a vote.").response::<200, Json<Vote>>()
            }),
        )
}
