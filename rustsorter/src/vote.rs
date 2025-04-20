use axum::{
    Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid;

use crate::{
    app_state::AppState,
    models::{Error, IntoNotFound, Json, MapErrorSqlx},
};

#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct Vote {
    pub left_entity_pk_namespace: String,
    pub left_entity_pk: String,
    pub right_entity_pk_namespace: String,
    pub right_entity_pk: String,
    pub voter_user_id: Uuid,
    pub magnitude: i32,
    pub attribute_id: i32,
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
    magnitude: i32,
}

async fn create_vote(
    State(state): State<AppState>,
    Json(payload): Json<VotePayload>,
) -> Result<impl IntoResponse, Error> {
    let vote = sqlx::query_as!(
        Vote,
        "
INSERT INTO votes (
    left_entity_pk_namespace,
    left_entity_pk,
    right_entity_pk_namespace,
    right_entity_pk,
    voter_user_id,
    magnitude,
    attribute_id
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING left_entity_pk_namespace,
    left_entity_pk,
    right_entity_pk_namespace,
    right_entity_pk,
    voter_user_id,
    magnitude,
    attribute_id
        ",
        payload.left_entity_pk_namespace,
        payload.left_entity_pk,
        payload.right_entity_pk_namespace,
        payload.right_entity_pk,
        payload.voter_user_id,
        payload.magnitude,
        payload.attribute_id
    )
    .fetch_one(&state.db)
    .await
    .map_error("vote")?;

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
    let vote = sqlx::query_as!(
        Vote,
        "
SELECT left_entity_pk_namespace,
    left_entity_pk,
    right_entity_pk_namespace,
    right_entity_pk,
    voter_user_id,
    magnitude,
    attribute_id
FROM votes
WHERE left_entity_pk_namespace = $1
    AND left_entity_pk = $2
    AND right_entity_pk_namespace = $3
    AND right_entity_pk = $4
    AND voter_user_id = $5
    AND attribute_id = $6
        ",
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        user_id,
        attr_id
    )
    .fetch_optional(&state.db)
    .await
    .map_error("vote")?
    .catch_not_found("vote")?;

    Ok((StatusCode::OK, Json(vote)))
}

async fn list_votes(
    State(state): State<AppState>,
    // TODO: Add query parameters for filtering, e.g., axum::extract::Query<VoteFilterParams>
) -> Result<impl IntoResponse, Error> {
    let votes = sqlx::query_as!(
        Vote,
        "
SELECT left_entity_pk_namespace,
    left_entity_pk,
    right_entity_pk_namespace,
    right_entity_pk,
    voter_user_id,
    magnitude,
    attribute_id
FROM votes
ORDER BY voter_user_id,
    attribute_id,
    left_entity_pk_namespace,
    left_entity_pk"
    )
    .fetch_all(&state.db)
    .await
    .map_error("vote")?;

    Ok((StatusCode::OK, Json(votes)))
}

async fn update_vote(
    State(state): State<AppState>,
    Path((left_ns, left_pk, right_ns, right_pk, user_id, attr_id)): Path<(
        String,
        String,
        String,
        String,
        Uuid,
        i32,
    )>,
    Json(payload): Json<UpdateVotePayload>,
) -> Result<impl IntoResponse, Error> {
    let vote = sqlx::query_as!(
        Vote,
        "
        UPDATE votes
        SET magnitude = $7
        WHERE left_entity_pk_namespace = $1
            AND left_entity_pk = $2
            AND right_entity_pk_namespace = $3
            AND right_entity_pk = $4
            AND voter_user_id = $5
            AND attribute_id = $6
        RETURNING left_entity_pk_namespace,
            left_entity_pk,
            right_entity_pk_namespace,
            right_entity_pk,
            voter_user_id,
            magnitude,
            attribute_id
        ",
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        user_id,
        attr_id,
        payload.magnitude
    )
    .fetch_optional(&state.db)
    .await
    .map_error("vote")?
    .catch_not_found("vote")?;

    Ok((StatusCode::OK, Json(vote)))
}

async fn delete_vote(
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
    sqlx::query!(
        "
        DELETE FROM votes
        WHERE left_entity_pk_namespace = $1
          AND left_entity_pk = $2
          AND right_entity_pk_namespace = $3
          AND right_entity_pk = $4
          AND voter_user_id = $5
          AND attribute_id = $6
        ",
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        user_id,
        attr_id
    )
    .execute(&state.db)
    .await
    .map_error("vote")?
    .catch_not_found("vote")?;

    Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_vote).get(list_votes))
        .route(
            "/:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:attr_id",
            get(get_vote).put(update_vote).delete(delete_vote),
        )
}
