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
    models::{ErrorResponse, User},
};

#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct EntityRelationship {
    user_id: Uuid,
    parent_pk_namespace: String,
    parent_pk: String,
    child_pk_namespace: String,
    child_pk: String,
    created_at: Option<NaiveDateTime>,
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
) -> Result<impl IntoResponse, ErrorResponse> {
    // TODO: Add validation: Check if parent and child entities actually exist?

    match sqlx::query_as!(
        EntityRelationship,
        "
INSERT INTO entity_relationships (
        parent_pk_namespace,
        parent_pk,
        child_pk_namespace,
        child_pk,
        user_id
    )
VALUES ($1, $2, $3, $4, $5)
RETURNING parent_pk_namespace,
    parent_pk,
    child_pk_namespace,
    child_pk,
    user_id,
    created_at",
        payload.parent_pk_namespace,
        payload.parent_pk,
        payload.child_pk_namespace,
        payload.child_pk,
        user.id
    )
    .fetch_one(&state.db)
    .await
    {
        Ok(relationship) => Ok((StatusCode::CREATED, Json(relationship))),
        Err(e) => {
            log::error!("Failed to create entity relationship: {}", e);
            if e.as_database_error()
                .is_some_and(|e| e.is_unique_violation())
            {
                return Err(ErrorResponse::new(
                    StatusCode::CONFLICT,
                    "This relationship already exists.".to_string(),
                ));
            }
            // TODO: Handle foreign key violations if parent/child entities don't exist
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create relationship".to_string(),
            ))
        }
    }
}

async fn list_relationships(
    State(state): State<AppState>,
    Query(params): Query<ListRelationshipsQuery>,
) -> Result<impl IntoResponse, ErrorResponse> {
    let mut query = "
SELECT parent_pk_namespace,
    parent_pk,
    child_pk_namespace,
    child_pk,
    user_id,
    created_at
FROM entity_relationships
WHERE 1 = 1"
        .to_string();

    let mut args: Vec<String> = Vec::new();
    let mut uuid_args: Vec<Uuid> = Vec::new();
    let mut arg_count = 1;

    if let Some(val) = &params.parent_pk_namespace {
        query.push_str(&format!(" AND parent_pk_namespace = ${}", arg_count));
        args.push(val.clone());
        arg_count += 1;
    }
    if let Some(val) = &params.parent_pk {
        query.push_str(&format!(" AND parent_pk = ${}", arg_count));
        args.push(val.clone());
        arg_count += 1;
    }
    if let Some(val) = &params.child_pk_namespace {
        query.push_str(&format!(" AND child_pk_namespace = ${}", arg_count));
        args.push(val.clone());
        arg_count += 1;
    }
    if let Some(val) = &params.child_pk {
        query.push_str(&format!(" AND child_pk = ${}", arg_count));
        args.push(val.clone());
        arg_count += 1;
    }
    if let Some(val) = &params.submitter_user_id {
        query.push_str(&format!(" AND submitter_user_id = ${}", arg_count));
        uuid_args.push(*val);
    }

    query.push_str(" ORDER BY created_at DESC");

    let mut sqlx_query = sqlx::query_as::<_, EntityRelationship>(&query);

    for arg in &args {
        sqlx_query = sqlx_query.bind(arg);
    }

    for arg in &uuid_args {
        sqlx_query = sqlx_query.bind(arg);
    }

    match sqlx_query.fetch_all(&state.db).await {
        Ok(relationships) => Ok((StatusCode::OK, Json(relationships))),
        Err(e) => {
            log::error!("Failed to list entity relationships: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to list relationships".to_string(),
            ))
        }
    }
}

async fn delete_relationship(
    State(state): State<AppState>,
    Extension(_user): Extension<User>,
    Query(params): Query<DeleteRelationshipQuery>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // TODO: Implement actual permission check.

    match sqlx::query!(
        "
DELETE FROM entity_relationships
WHERE parent_pk_namespace = $1
    AND parent_pk = $2
    AND child_pk_namespace = $3
    AND child_pk = $4",
        params.parent_pk_namespace,
        params.parent_pk,
        params.child_pk_namespace,
        params.child_pk
    )
    .execute(&state.db)
    .await
    {
        Ok(result) => {
            if result.rows_affected() > 0 {
                Ok(StatusCode::NO_CONTENT)
            } else {
                Err(ErrorResponse::new(
                    StatusCode::NOT_FOUND,
                    "Relationship not found".to_string(),
                ))
            }
        }
        Err(e) => {
            log::error!("Failed to delete entity relationship: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to delete relationship".to_string(),
            ))
        }
    }
}
