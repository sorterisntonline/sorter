use axum::{
    Router,
    extract::{Extension, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::post,
};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{Error, IntoNotFound, MapError, MapErrorSqlx, User},
};

#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct EntityRelationship {
    pub user_id: Uuid,
    pub parent_pk_namespace: String,
    pub parent_pk: String,
    pub child_pk_namespace: String,
    pub child_pk: String,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, Debug)]
pub struct CreateRelationshipPayload {
    parent_pk_namespace: String,
    parent_pk: String,
    child_pk_namespace: String,
    child_pk: String,
}

#[derive(Deserialize, Debug)]
pub struct ListRelationshipsQuery {
    parent_pk_namespace: Option<String>,
    parent_pk: Option<String>,
    child_pk_namespace: Option<String>,
    child_pk: Option<String>,
    submitter_user_id: Option<Uuid>,
}

#[derive(Deserialize, Debug)]
pub struct DeleteRelationshipQuery {
    parent_pk_namespace: String,
    parent_pk: String,
    child_pk_namespace: String,
    child_pk: String,
}

pub fn routes() -> Router<AppState> {
    Router::new().route(
        "/",
        post(create_relationship)
            .get(list_relationships)
            .delete(delete_relationship),
    )
}

async fn create_relationship(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<CreateRelationshipPayload>,
) -> Result<impl IntoResponse, Error> {
    // TODO: Add validation: Check if parent and child entities actually exist?

    let relationship = sqlx::query_file_as!(
        EntityRelationship,
        "../database/sql/entity_relationship/insert.sql",
        payload.parent_pk_namespace,
        payload.parent_pk,
        payload.child_pk_namespace,
        payload.child_pk,
        user.id
    )
    .fetch_one(&state.db)
    .await
    .map_error("relationship")?;

    Ok((StatusCode::CREATED, Json(relationship)))
}

async fn list_relationships(
    State(state): State<AppState>,
    Query(params): Query<ListRelationshipsQuery>,
) -> Result<impl IntoResponse, Error> {
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
) -> Result<impl IntoResponse, Error> {
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
