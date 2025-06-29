use axum::{
    Json,
    Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use chrono::NaiveDateTime;
use log::warn;
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid;

use crate::{
    app_state::AppState,
    models::{Error, IntoNotFound, MapErrorSqlx},
};

#[derive(Serialize, Debug, sqlx::FromRow)]
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

#[derive(Deserialize, Debug)]
pub struct VotePayload {
    left_entity_pk_namespace: String,
    left_entity_pk: String,
    right_entity_pk_namespace: String,
    right_entity_pk: String,
    voter_user_id: Uuid,
    magnitude: i32,
    attribute_id: i32,
}

#[derive(Deserialize, Debug)]
pub struct UpdateVotePayload {
    _magnitude: i32,
}

async fn create_vote(
    State(state): State<AppState>,
    Json(payload): Json<VotePayload>,
) -> Result<impl IntoResponse, Error> {
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
        payload.voter_user_id
    )
    .fetch_one(&state.db)
    .await
    .map_error("entity pair")?;

    Ok((StatusCode::CREATED, Json(vote)))
}

async fn get_vote(
    State(state): State<AppState>,
    Path((left_ns, left_pk, right_ns, right_pk, user_id, attr_id)): Path<(
        String,
        String,
        String,
        String,
        Uuid,
        i32,
    )>,
) -> Result<impl IntoResponse, Error> {
    let (query_left_ns, query_left_pk, query_right_ns, query_right_pk) = if (
        left_ns.clone(),
        left_pk.clone(),
    ) < (
        right_ns.clone(),
        right_pk.clone(),
    ) {
        (left_ns, left_pk, right_ns, right_pk)
    } else {
        warn!(left_ns, left_pk, right_ns, right_pk; "request path for get_vote received non-canonical order for pair");
        (left_ns, left_pk, right_ns, right_pk)
    };

    let vote = sqlx::query_file_as!(
        Vote,
        "../database/sql/vote/select.sql",
        query_left_ns,
        query_left_pk,
        query_right_ns,
        query_right_pk,
        user_id,
        attr_id
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

async fn list_votes(State(state): State<AppState>) -> Result<impl IntoResponse, Error> {
    let votes = sqlx::query_file_as!(Vote, "../database/sql/vote/list.sql",)
        .fetch_all(&state.db)
        .await
        .map_error("votes")?;

    Ok((StatusCode::OK, Json(votes)))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_vote).get(list_votes))
        .route(
            "/:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:attr_id",
            get(get_vote),
        )
}
