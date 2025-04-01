use axum::{
    extract::{Path, State, Query, Extension},
    http::StatusCode,
    response::{IntoResponse, Json},
    routing::{delete, get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use chrono::{DateTime, Utc, NaiveDateTime};
use uuid::Uuid;

use crate::app_state::AppState;
use crate::models::User;

// Represents an entity relationship from the database
#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct EntityRelationship {
    parent_pk_namespace: String,
    parent_pk: String,
    child_pk_namespace: String,
    child_pk: String,
    submitter_user_id: Option<Uuid>, // Match schema (nullable for now, depends on auth)
    created_at: Option<NaiveDateTime>, // Consistent with entity.rs fix
}

// Payload for creating a new relationship
#[derive(Deserialize, Debug)]
pub struct CreateRelationshipPayload {
    parent_pk_namespace: String,
    parent_pk: String,
    child_pk_namespace: String,
    child_pk: String,
}

// Query parameters for filtering relationships on GET /
#[derive(Deserialize, Debug)]
pub struct ListRelationshipsQuery {
    parent_pk_namespace: Option<String>,
    parent_pk: Option<String>,
    child_pk_namespace: Option<String>,
    child_pk: Option<String>,
    submitter_user_id: Option<Uuid>,
    // Consider adding pagination parameters (limit, offset) for production
}

// Query parameters for identifying a relationship on DELETE /
// We need all 4 parts of the composite key to uniquely identify a relationship
#[derive(Deserialize, Debug)]
pub struct DeleteRelationshipQuery {
    parent_pk_namespace: String,
    parent_pk: String,
    child_pk_namespace: String,
    child_pk: String,
}

// Define the routes for entity_relationships CRUD operations
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_relationship).get(list_relationships).delete(delete_relationship))
    // No nested routes needed for this top-level approach
}

// --- Handler Functions ---

// POST / - Create a new entity relationship
async fn create_relationship(
    State(state): State<AppState>,
    Extension(user): Extension<User>, // Get authenticated user from middleware extension
    Json(payload): Json<CreateRelationshipPayload>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // TODO: Add validation: Check if parent and child entities actually exist?

    match sqlx::query_as!(
        EntityRelationship,
        r#"
        INSERT INTO entity_relationships
            (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk, submitter_user_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING parent_pk_namespace, parent_pk, child_pk_namespace, child_pk, submitter_user_id, created_at
        "#,
        payload.parent_pk_namespace,
        payload.parent_pk,
        payload.child_pk_namespace,
        payload.child_pk,
        user.id // Assuming User struct has 'id: Uuid'
    )
    .fetch_one(&state.db)
    .await
    {
        Ok(relationship) => Ok((StatusCode::CREATED, Json(relationship))),
        Err(e) => {
            log::error!("Failed to create entity relationship: {}", e);
             if let Some(db_err) = e.as_database_error() {
                 if db_err.is_unique_violation() {
                     return Err((StatusCode::CONFLICT, "This relationship already exists.".to_string()));
                 }
                 // TODO: Handle foreign key violations if parent/child entities don't exist
             }
            Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to create relationship".to_string()))
        }
    }
}

// GET / - List entity relationships with filtering
async fn list_relationships(
    State(state): State<AppState>,
    Query(params): Query<ListRelationshipsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Basic dynamic query building (can be improved with a query builder crate)
    let mut query = "SELECT parent_pk_namespace, parent_pk, child_pk_namespace, child_pk, submitter_user_id, created_at FROM entity_relationships WHERE 1=1".to_string();
    let mut args: Vec<String> = Vec::new(); // Using String for simplicity here, adjust types if needed
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
        uuid_args.push(*val); // Assuming Uuid is Copy or handle appropriately
        arg_count += 1;
    }

    query.push_str(" ORDER BY created_at DESC"); // Add ordering

    // Need to build the query manually with sqlx::query_as because query_as! doesn't support dynamic args easily
    let mut sqlx_query = sqlx::query_as::<_, EntityRelationship>(&query);

    // Bind string arguments
    for arg in &args {
        sqlx_query = sqlx_query.bind(arg);
    }
    // Bind UUID arguments
     for arg in &uuid_args {
        sqlx_query = sqlx_query.bind(arg);
    }


    match sqlx_query.fetch_all(&state.db).await {
        Ok(relationships) => Ok((StatusCode::OK, Json(relationships))),
        Err(e) => {
            log::error!("Failed to list entity relationships: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to list relationships".to_string()))
        }
    }
}


// DELETE / - Delete a specific entity relationship
async fn delete_relationship(
    State(state): State<AppState>,
    Extension(user): Extension<User>, // Get user for permission checks
    Query(params): Query<DeleteRelationshipQuery>, // Use query params to identify relationship
) -> Result<impl IntoResponse, (StatusCode, String)> {

    // --- Permission Check Placeholder ---
    // TODO: Implement actual permission check.
    // E.g., fetch the relationship first, check if user.id == relationship.submitter_user_id
    // or if the user has admin privileges.
    // let relationship_to_delete = sqlx::query!(...)
    // if relationship_to_delete.submitter_user_id != Some(user.id) {
    //     return Err((StatusCode::FORBIDDEN, "You do not have permission to delete this relationship".to_string()));
    // }
    // --- End Placeholder ---


    match sqlx::query!(
        r#"
        DELETE FROM entity_relationships
        WHERE parent_pk_namespace = $1
          AND parent_pk = $2
          AND child_pk_namespace = $3
          AND child_pk = $4
        "#,
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
                Ok(StatusCode::NO_CONTENT) // Success, no content
            } else {
                // Could be the relationship never existed, or the combination was wrong
                Err((StatusCode::NOT_FOUND, "Relationship not found".to_string()))
            }
        },
        Err(e) => {
             log::error!("Failed to delete entity relationship: {}", e);
             Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete relationship".to_string()))
        }
    }
}
