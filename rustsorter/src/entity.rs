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
    models::{Error, IntoNotFound, Json, MapError, MapErrorSqlx},
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
) -> Result<impl IntoResponse, Error> {
    let entity = sqlx::query_as!(
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
    .map_conflict(&format!(
        "entity with pk_namespace '{}' and pk '{}'",
        payload.pk_namespace, payload.pk
    ))?;

    Ok((StatusCode::CREATED, Json(entity)))
}

async fn get_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, Error> {
    let entity = sqlx::query_as!(
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
    .map_internal()?
    .catch_not_found("entity")?;

    Ok((StatusCode::OK, Json(entity)))
}

async fn list_entities(State(state): State<AppState>) -> Result<impl IntoResponse, Error> {
    let entities = sqlx::query_as!(
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
    .map_internal()?;

    Ok((StatusCode::OK, Json(entities)))
}

async fn update_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
    Json(payload): Json<EntityPayload>,
) -> Result<impl IntoResponse, Error> {
    if pk_namespace != payload.pk_namespace || pk != payload.pk {
        return Err(Error::BadRequest {
            message: "path parameters must match payload primary key".into(),
        });
    }

    let entity = sqlx::query_as!(
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
    .map_internal()?
    .catch_not_found("entity")?;

    Ok((StatusCode::OK, Json(entity)))
}

async fn delete_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, Error> {
    sqlx::query!(
        "
DELETE FROM entities
WHERE pk_namespace = $1
    AND pk = $2",
        pk_namespace,
        pk
    )
    .execute(&state.db)
    .await
    .map_internal()?
    .catch_not_found("entity")?;

    Ok(StatusCode::NO_CONTENT)
}
