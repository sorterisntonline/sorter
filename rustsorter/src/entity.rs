use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use chrono::NaiveDateTime;

use crate::{app_state::AppState, models::{ErrorResponse, Json}};

// Represents an entity fetched from the database
#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct Entity {
    pub pk_namespace: String,
    pub pk: String,
    pub title: Option<String>,
    #[sqlx(json)]
    pub metadata: Option<JsonValue>,
    pub created_at: Option<NaiveDateTime>,
}

// Represents the payload for creating/updating an entity
#[derive(Deserialize, Debug)]
pub struct EntityPayload {
    pk_namespace: String,
    pk: String,
    title: Option<String>,
    metadata: Option<JsonValue>,
}

// Add this new struct within entity.rs
#[derive(Serialize, Debug)]
pub struct RelatedEntityIdentifier {
    pk_namespace: String,
    pk: String,
}

// Add this new struct within entity.rs
#[derive(Serialize, Debug)]
pub struct EntityDetailResponse {
    entity: Entity,
    parents: Vec<RelatedEntityIdentifier>,
    children: Vec<RelatedEntityIdentifier>,
}

// Define the routes for entity CRUD operations
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_entity).get(list_entities))
        .route("/:pk_namespace/:pk/details", get(get_entity_details))
        .route("/:pk_namespace/:pk", get(get_entity).put(update_entity).delete(delete_entity))
}

// --- Handler Functions ---

// POST / - Create a new entity
async fn create_entity(
    State(state): State<AppState>,
    Json(payload): Json<EntityPayload>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    match sqlx::query_as!(
        Entity,
        r#"
        INSERT INTO entities (pk_namespace, pk, title, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING pk_namespace, pk, title, metadata, created_at
        "#,
        payload.pk_namespace,
        payload.pk,
        payload.title,
        payload.metadata
    )
    .fetch_one(&state.db)
    .await
    {
        Ok(entity) => Ok((StatusCode::CREATED, Json(entity))),
        Err(e) => {
            log::error!("Failed to create entity: {}", e);
            if let Some(db_err) = e.as_database_error() {
                if db_err.is_unique_violation() {
                    return Err(ErrorResponse::new(StatusCode::CONFLICT, format!("Entity with pk_namespace '{}' and pk '{}' already exists.", payload.pk_namespace, payload.pk)));
                }
            }
            Err(ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create entity".to_string()))
        }
    }
}

// GET /:pk_namespace/:pk - Get a specific entity
async fn get_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    match sqlx::query_as!(
        Entity,
        r#"
        SELECT pk_namespace, pk, title, metadata, created_at
        FROM entities
        WHERE pk_namespace = $1 AND pk = $2
        "#,
        pk_namespace,
        pk
    )
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(entity)) => Ok((StatusCode::OK, Json(entity))),
        Ok(None) => Err(ErrorResponse::new(StatusCode::NOT_FOUND, "Entity not found".to_string())),
        Err(e) => {
            log::error!("Failed to get entity: {}", e);
            Err(ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to retrieve entity".to_string()))
        }
    }
}

// GET / - List all entities (consider pagination for production)
async fn list_entities(
    State(state): State<AppState>
) -> Result<impl IntoResponse, (StatusCode, String)> {
    match sqlx::query_as!(
        Entity,
        r#"SELECT pk_namespace, pk, title, metadata, created_at FROM entities ORDER BY created_at DESC"#
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(entities) => Ok((StatusCode::OK, Json(entities))),
        Err(e) => {
             log::error!("Failed to list entities: {}", e);
             Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to list entities".to_string()))
        }
    }
}

// PUT /:pk_namespace/:pk - Update an existing entity
async fn update_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
    Json(payload): Json<EntityPayload>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    if pk_namespace != payload.pk_namespace || pk != payload.pk {
        return Err(ErrorResponse::new(StatusCode::BAD_REQUEST, "Path parameters must match payload primary key".to_string()));
    }

    match sqlx::query_as!(
        Entity,
        r#"
        UPDATE entities
        SET title = $3, metadata = $4
        WHERE pk_namespace = $1 AND pk = $2
        RETURNING pk_namespace, pk, title, metadata, created_at
        "#,
        pk_namespace,
        pk,
        payload.title,
        payload.metadata
    )
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(entity)) => Ok((StatusCode::OK, Json(entity))),
        Ok(None) => Err(ErrorResponse::new(StatusCode::NOT_FOUND, "Entity not found".to_string())),
        Err(e) => {
            log::error!("Failed to update entity: {}", e);
            Err(ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update entity".to_string()))
        }
    }
}

// DELETE /:pk_namespace/:pk - Delete an entity
async fn delete_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    match sqlx::query!(
        r#"
        DELETE FROM entities
        WHERE pk_namespace = $1 AND pk = $2
        "#,
        pk_namespace,
        pk
    )
    .execute(&state.db)
    .await
    {
        Ok(result) => {
            if result.rows_affected() > 0 {
                Ok(StatusCode::NO_CONTENT)
            } else {
                Err((StatusCode::NOT_FOUND, "Entity not found".to_string()))
            }
        },
        Err(e) => {
             log::error!("Failed to delete entity: {}", e);
             Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to delete entity".to_string()))
        }
    }
}

// GET /:pk_namespace/:pk/details - Get entity details including parent and child relationships
async fn get_entity_details(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    // 1. Fetch the main entity
    let entity_result = sqlx::query_as!(
        Entity,
        r#"
        SELECT pk_namespace, pk, title, metadata, created_at
        FROM entities
        WHERE pk_namespace = $1 AND pk = $2
        "#,
        pk_namespace,
        pk
    )
    .fetch_optional(&state.db)
    .await;

    let entity = match entity_result {
        Ok(Some(entity)) => entity,
        Ok(None) => return Err(ErrorResponse::new(StatusCode::NOT_FOUND, "Entity not found".to_string())),
        Err(e) => {
            log::error!("Failed to fetch entity for details view: {}", e);
            return Err(ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to retrieve entity".to_string()));
        }
    };

    // 2. Fetch parents (entities that have this entity as a child)
    let parents_result = sqlx::query_as!(
        RelatedEntityIdentifier,
        r#"
        SELECT parent_pk_namespace as "pk_namespace!", parent_pk as "pk!"
        FROM entity_relationships
        WHERE child_pk_namespace = $1 AND child_pk = $2
        ORDER BY parent_pk_namespace, parent_pk -- Optional ordering
        "#,
        pk_namespace,
        pk
    )
    .fetch_all(&state.db)
    .await;

    let parents = match parents_result {
        Ok(parents) => parents,
        Err(e) => {
            log::error!("Failed to fetch parents for entity {}/{}: {}", pk_namespace, pk, e);
            // Decide if this is a fatal error or if we can return partial data
            // For now, let's treat it as fatal for the details view
            return Err(ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to retrieve parent relationships".to_string()));
        }
    };

    // 3. Fetch children (entities that have this entity as a parent)
    let children_result = sqlx::query_as!(
        RelatedEntityIdentifier,
        r#"
        SELECT child_pk_namespace as "pk_namespace!", child_pk as "pk!"
        FROM entity_relationships
        WHERE parent_pk_namespace = $1 AND parent_pk = $2
        ORDER BY child_pk_namespace, child_pk -- Optional ordering
        "#,
        pk_namespace,
        pk
    )
    .fetch_all(&state.db)
    .await;

    let children = match children_result {
        Ok(children) => children,
         Err(e) => {
            log::error!("Failed to fetch children for entity {}/{}: {}", pk_namespace, pk, e);
             return Err(ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to retrieve child relationships".to_string()));
        }
    };

    // 4. Construct the response
    let response = EntityDetailResponse {
        entity,
        parents,
        children,
    };

    Ok((StatusCode::OK, Json(response)))
}