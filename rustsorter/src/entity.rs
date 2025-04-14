use axum::{
    Router,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::{
    app_state::AppState,
    models::{ErrorResponse, Json},
};

#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct Entity {
    pk_namespace: String,
    pk: String,
    title: Option<String>,
    #[sqlx(json)]
    metadata: Option<JsonValue>,
    created_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, Debug)]
pub struct EntityPayload {
    pk_namespace: String,
    pk: String,
    title: Option<String>,
    metadata: Option<JsonValue>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_entity).get(list_entities))
        .route(
            "/:pk_namespace/:pk",
            get(get_entity).put(update_entity).delete(delete_entity),
        )
}

async fn create_entity(
    State(state): State<AppState>,
    Json(payload): Json<EntityPayload>,
) -> Result<impl IntoResponse, ErrorResponse> {
    match sqlx::query_as!(
        Entity,
        "
INSERT INTO entities (pk_namespace, pk, title, metadata)
VALUES ($1, $2, $3, $4)
RETURNING pk_namespace,
    pk,
    title,
    metadata,
    created_at",
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
                    return Err(ErrorResponse::new(
                        StatusCode::CONFLICT,
                        format!(
                            "Entity with pk_namespace '{}' and pk '{}' already exists.",
                            payload.pk_namespace, payload.pk
                        ),
                    ));
                }
            }
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create entity".to_string(),
            ))
        }
    }
}

async fn get_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, ErrorResponse> {
    match sqlx::query_as!(
        Entity,
        "
SELECT pk_namespace,
    pk,
    title,
    metadata,
    created_at
FROM entities
WHERE pk_namespace = $1
    AND pk = $2",
        pk_namespace,
        pk
    )
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(entity)) => Ok((StatusCode::OK, Json(entity))),
        Ok(None) => Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "Entity not found".to_string(),
        )),
        Err(e) => {
            log::error!("Failed to get entity: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to retrieve entity".to_string(),
            ))
        }
    }
}

async fn list_entities(State(state): State<AppState>) -> Result<impl IntoResponse, ErrorResponse> {
    match sqlx::query_as!(
        Entity,
        "
SELECT pk_namespace,
    pk,
    title,
    metadata,
    created_at
FROM entities
ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(entities) => Ok((StatusCode::OK, Json(entities))),
        Err(e) => {
            log::error!("Failed to list entities: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to list entities".to_string(),
            ))
        }
    }
}

async fn update_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
    Json(payload): Json<EntityPayload>,
) -> Result<impl IntoResponse, ErrorResponse> {
    if pk_namespace != payload.pk_namespace || pk != payload.pk {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Path parameters must match payload primary key".to_string(),
        ));
    }

    match sqlx::query_as!(
        Entity,
        "
UPDATE entities
SET title = $3,
    metadata = $4
WHERE pk_namespace = $1
    AND pk = $2
RETURNING pk_namespace,
    pk,
    title,
    metadata,
    created_at",
        pk_namespace,
        pk,
        payload.title,
        payload.metadata
    )
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(entity)) => Ok((StatusCode::OK, Json(entity))),
        Ok(None) => Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "Entity not found".to_string(),
        )),
        Err(e) => {
            log::error!("Failed to update entity: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to update entity".to_string(),
            ))
        }
    }
}

async fn delete_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, ErrorResponse> {
    match sqlx::query!(
        "
DELETE FROM entities
WHERE pk_namespace = $1
    AND pk = $2",
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
                Err(ErrorResponse::new(
                    StatusCode::NOT_FOUND,
                    "Entity not found".to_string(),
                ))
            }
        }
        Err(e) => {
            log::error!("Failed to delete entity: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to delete entity".to_string(),
            ))
        }
    }
}
