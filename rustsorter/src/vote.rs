use aide::axum::{
    ApiRouter,
    routing::{get_with, post_with},
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::NaiveDateTime;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid;
use ts_rs::TS;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, IntoNotFound, Json, MapErrorSqlx},
};

/// Canonical ordering for entity pairs.
/// Returns (left_ns, left_pk, right_ns, right_pk, adjusted_magnitude)
fn canonicalize_entity_pair(
    left_ns: String,
    left_pk: String,
    right_ns: String,
    right_pk: String,
    magnitude: i32,
) -> (String, String, String, String, i32) {
    if (&left_ns, &left_pk) <= (&right_ns, &right_pk) {
        (left_ns, left_pk, right_ns, right_pk, magnitude)
    } else {
        (right_ns, right_pk, left_ns, left_pk, -magnitude)
    }
}

#[derive(Serialize, Debug, sqlx::FromRow, JsonSchema, TS)]
#[ts(export)]
pub struct Vote {
    pub left_entity_ns: String,
    pub left_entity_pk: String,
    pub right_entity_ns: String,
    pub right_entity_pk: String,
    pub user_id: Uuid,
    pub magnitude: i32,
    pub attribute_id: i32,
    pub created_at: NaiveDateTime,
    pub deleted_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, JsonSchema, TS)]
#[ts(export)]
pub struct VotePath {
    left_ns: String,
    left_pk: String,
    right_ns: String,
    right_pk: String,
    user_id: Uuid,
    attr_id: i32,
}

#[derive(Deserialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct VotePayload {
    left_entity_ns: String,
    left_entity_pk: String,
    right_entity_ns: String,
    right_entity_pk: String,
    magnitude: i32,
    attribute_id: i32,
}

async fn create_vote(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<VotePayload>,
) -> Result<(StatusCode, Json<Vote>), Error> {
    let (left_ns, left_pk, right_ns, right_pk, magnitude) = canonicalize_entity_pair(
        payload.left_entity_ns,
        payload.left_entity_pk,
        payload.right_entity_ns,
        payload.right_entity_pk,
        payload.magnitude,
    );

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
    let (left_ns, left_pk, right_ns, right_pk, _) = canonicalize_entity_pair(
        path.left_ns,
        path.left_pk,
        path.right_ns,
        path.right_pk,
        0, // magnitude doesn't matter for lookup
    );

    let vote = sqlx::query_file_as!(
        Vote,
        "../database/sql/vote/select.sql",
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        path.user_id,
        path.attr_id
    )
    .fetch_optional(&state.db)
    .await
    .map_error("vote")?
    .catch_not_found("vote")?;

    Ok((StatusCode::OK, Json(vote)))
}

#[derive(Deserialize, Debug, JsonSchema)]
struct VoteFilterParams {
    user_id: Option<Uuid>,
    attribute_id: Option<i32>,
    limit: Option<i32>,
}

#[derive(Deserialize, JsonSchema)]
pub struct DeleteVotePath {
    left_ns: String,
    left_pk: String,
    right_ns: String,
    right_pk: String,
    user_id: Uuid,
    attr_id: i32,
}

async fn list_votes(
    State(state): State<AppState>,
    Query(params): Query<VoteFilterParams>,
) -> Result<(StatusCode, Json<Vec<Vote>>), Error> {
    let votes = if let Some(user_id) = params.user_id {
        sqlx::query_file_as!(
            Vote,
            "../database/sql/vote/list_by_user.sql",
            user_id,
            params.limit
        )
        .fetch_all(&state.db)
        .await
        .map_error("votes")?
    } else {
        sqlx::query_file_as!(Vote, "../database/sql/vote/list.sql")
        .fetch_all(&state.db)
        .await
        .map_error("votes")?
    };

    Ok((StatusCode::OK, Json(votes)))
}

#[derive(Deserialize, Debug, JsonSchema)]
struct SongVoteParams {
    namespace: String,
    pk: String,
    limit: Option<i32>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct SongVote {
    pub left_ns: String,
    pub left_pk: String,
    pub right_ns: String,
    pub right_pk: String,
    pub user_id: Uuid,
    pub attr_id: i32,
    pub magnitude: i32,
    pub created_at: NaiveDateTime,
    pub opponent_id: Option<String>,
    pub opponent_title: Option<String>,
}

async fn list_song_votes(
    State(state): State<AppState>,
    Query(params): Query<SongVoteParams>,
) -> Result<(StatusCode, Json<Vec<SongVote>>), Error> {
    let limit = params.limit.unwrap_or(50) as i64;
    
    let votes = sqlx::query_file_as!(
        SongVote,
        "../database/sql/vote/list_by_entity.sql",
        params.namespace,
        params.pk,
        limit
    )
    .fetch_all(&state.db)
    .await
    .map_error("song votes")?;

    Ok((StatusCode::OK, Json(votes)))
}

async fn delete_vote(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(path): Path<DeleteVotePath>,
) -> Result<(StatusCode, Json<Vote>), Error> {
    // Ensure user can only delete their own votes
    if user.id != path.user_id {
        return Err(Error::Forbidden);
    }

    let (left_ns, left_pk, right_ns, right_pk, _) = canonicalize_entity_pair(
        path.left_ns,
        path.left_pk,
        path.right_ns,
        path.right_pk,
        0, // magnitude doesn't matter for lookup
    );

    let vote = sqlx::query_file_as!(
        Vote,
        "../database/sql/vote/soft_delete.sql",
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        path.user_id,
        path.attr_id
    )
    .fetch_optional(&state.db)
    .await
    .map_error("vote")?
    .catch_not_found("vote")?;

    Ok((StatusCode::OK, Json(vote)))
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
                op.description("List votes. Use ?user_id=<uuid> to filter by user.")
                    .response::<200, Json<Vec<Vote>>>()
            }),
        )
        .api_route(
            "/entity",
            get_with(list_song_votes, |op| {
                op.description("List votes for a specific entity. Use ?namespace=<ns>&pk=<pk> to filter.")
                    .response::<200, Json<Vec<SongVote>>>()
            }),
        )
        .api_route(
            "/{left_ns}/{left_pk}/{right_ns}/{right_pk}/{user_id}/{attr_id}",
            get_with(get_vote, |op| {
                op.description("Get a vote.").response::<200, Json<Vote>>()
            })
            .delete_with(delete_vote, |op| {
                op.description("Delete a vote (soft delete).")
                    .response::<200, Json<Vote>>()
            }),
        )
}
