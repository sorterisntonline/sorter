use aide::axum::{ApiRouter, routing::post};
use axum::{
    extract::{Extension, Query, State},
    http::StatusCode,
};
use chrono::NaiveDateTime;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::PgExecutor;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{Error, IntoNotFound, Json, MapErrorAnyhow, MapErrorSqlx, User},
};

#[derive(Serialize, Debug, sqlx::FromRow, JsonSchema)]
pub struct EntityRelationship {
    pub user_id: Uuid,
    pub parent_pk_namespace: String,
    pub parent_pk: String,
    pub child_pk_namespace: String,
    pub child_pk: String,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct CreateRelationshipPayload {
    pub parent_pk_namespace: String,
    pub parent_pk: String,
    pub child_pk_namespace: String,
    pub child_pk: String,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct ListRelationshipsQuery {
    parent_pk_namespace: Option<String>,
    parent_pk: Option<String>,
    child_pk_namespace: Option<String>,
    child_pk: Option<String>,
    submitter_user_id: Option<Uuid>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct DeleteRelationshipQuery {
    parent_pk_namespace: String,
    parent_pk: String,
    child_pk_namespace: String,
    child_pk: String,
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route(
        "/",
        post(post_route)
            .get(list_relationships)
            .delete(delete_relationship),
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
        payload.parent_pk_namespace,
        payload.parent_pk,
        payload.child_pk_namespace,
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
        payload.parent_pk_namespace,
        payload.parent_pk,
        payload.child_pk_namespace,
        payload.child_pk,
        user_id
    )
    .fetch_optional(executor)
    .await
    .map_error("relationship")
}

async fn post_route(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<CreateRelationshipPayload>,
) -> Result<(StatusCode, Json<EntityRelationship>), Error> {
    // TODO: Add validation: Check if parent and child entities actually exist?

    Ok((
        StatusCode::CREATED,
        Json(create_relationship(&state.db, payload, user.id).await?),
    ))
}

async fn list_relationships(
    State(state): State<AppState>,
    Query(params): Query<ListRelationshipsQuery>,
) -> Result<(StatusCode, Json<Vec<EntityRelationship>>), Error> {
    let relationships = sqlx::query_file_as!(
        EntityRelationship,
        "../database/sql/entity_relationship/list.sql",
        params.parent_pk_namespace,
        params.parent_pk,
        params.child_pk_namespace,
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
        params.parent_pk_namespace,
        params.parent_pk,
        params.child_pk_namespace,
        params.child_pk
    )
    .execute(&state.db)
    .await
    .map_internal()?
    .catch_not_found("relationship")?;

    Ok(StatusCode::NO_CONTENT)
}
