use aide::axum::{ApiRouter, routing::post_with};
use axum::{
    extract::{Extension, Query, State},
    http::StatusCode,
};
use chrono::NaiveDateTime;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::PgExecutor;
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{Error, IntoNotFound, Json, MapErrorAnyhow, MapErrorSqlx, User},
};

#[derive(Serialize, Debug, sqlx::FromRow, JsonSchema, TS)]
#[ts(export)]
pub struct EntityRelationship {
    pub user_id: Uuid,
    pub parent_ns: String,
    pub parent_pk: String,
    pub child_ns: String,
    pub child_pk: String,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct CreateRelationshipPayload {
    pub parent_ns: String,
    pub parent_pk: String,
    pub child_ns: String,
    pub child_pk: String,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct ListRelationshipsQuery {
    parent_ns: Option<String>,
    parent_pk: Option<String>,
    child_ns: Option<String>,
    child_pk: Option<String>,
    submitter_user_id: Option<Uuid>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct EntityRelationshipCreateQueryParams {
    upsert: Option<bool>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct DeleteRelationshipQuery {
    parent_ns: String,
    parent_pk: String,
    child_ns: String,
    child_pk: String,
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route(
        "/",
        post_with(post_route, |op| {
            op.description("Create a new relationship.")
                .response::<201, Json<EntityRelationship>>()
                .response::<200, Json<EntityRelationship>>()
        })
        .get_with(list_relationships, |op| {
            op.description("List all relationships.")
                .response::<200, Json<Vec<EntityRelationship>>>()
        })
        .delete_with(delete_relationship, |op| {
            op.description("Delete a relationship.")
                .response::<204, ()>()
        }),
    )
}

pub async fn create_relationship<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: CreateRelationshipPayload,
    user_id: Uuid,
) -> Result<EntityRelationship, Error> {
    sqlx::query_file_as!(
        EntityRelationship,
        "../database/sql/entity_relationship/insert.sql",
        payload.parent_ns,
        payload.parent_pk,
        payload.child_ns,
        payload.child_pk,
        user_id
    )
    .fetch_one(executor)
    .await
    .map_error("relationship")
}

pub async fn create_relationship_ignore_conflict<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: CreateRelationshipPayload,
    user_id: Uuid,
) -> Result<Option<EntityRelationship>, Error> {
    sqlx::query_file_as!(
        EntityRelationship,
        "../database/sql/entity_relationship/insert_ignore_conflict.sql",
        payload.parent_ns,
        payload.parent_pk,
        payload.child_ns,
        payload.child_pk,
        user_id
    )
    .fetch_optional(executor)
    .await
    .map_error("relationship")
}

pub async fn upsert_relationship<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: CreateRelationshipPayload,
    user_id: Uuid,
) -> Result<EntityRelationship, Error> {
    sqlx::query_file_as!(
        EntityRelationship,
        "../database/sql/entity_relationship/upsert.sql",
        payload.parent_ns,
        payload.parent_pk,
        payload.child_ns,
        payload.child_pk,
        user_id
    )
    .fetch_one(executor)
    .await
    .map_error("relationship")
}

async fn post_route(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Query(params): Query<EntityRelationshipCreateQueryParams>,
    Json(payload): Json<CreateRelationshipPayload>,
) -> Result<(StatusCode, Json<EntityRelationship>), Error> {
    // TODO: Add validation: Check if parent and child entities actually exist?

    if params.upsert.unwrap_or(false) {
        let relationship = upsert_relationship(&state.db, payload, user.id).await?;
        Ok((StatusCode::OK, Json(relationship)))
    } else {
        let relationship = create_relationship(&state.db, payload, user.id).await?;
        Ok((StatusCode::CREATED, Json(relationship)))
    }
}

async fn list_relationships(
    State(state): State<AppState>,
    Query(params): Query<ListRelationshipsQuery>,
) -> Result<(StatusCode, Json<Vec<EntityRelationship>>), Error> {
    let relationships = sqlx::query_file_as!(
        EntityRelationship,
        "../database/sql/entity_relationship/list.sql",
        params.parent_ns,
        params.parent_pk,
        params.child_ns,
        params.child_pk,
        params.submitter_user_id
    )
    .fetch_all(&state.db)
    .await
    .map_internal()?;

    Ok((StatusCode::OK, Json(relationships)))
}

async fn delete_relationship(
    State(state): State<AppState>,
    Extension(_user): Extension<User>,
    Query(params): Query<DeleteRelationshipQuery>,
) -> Result<StatusCode, Error> {
    // TODO: Implement actual permission check.

    sqlx::query_file!(
        "../database/sql/entity_relationship/delete.sql",
        params.parent_ns,
        params.parent_pk,
        params.child_ns,
        params.child_pk
    )
    .execute(&state.db)
    .await
    .map_internal()?
    .catch_not_found("relationship")?;

    Ok(StatusCode::NO_CONTENT)
}
