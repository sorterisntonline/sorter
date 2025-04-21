use axum::{
    Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, IntoNotFound, Json, MapError, MapErrorSqlx},
};

#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct Entity {
    pub user_id: Uuid,
    pub pk_namespace: String,
    pub pk: String,
    pub title: Option<String>,
    pub profile_picture_url: Option<String>,
    #[sqlx(json)]
    pub metadata: Option<JsonValue>,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, Debug)]
pub struct EntityPayload {
    pk_namespace: String,
    pk: String,
    title: Option<String>,
    metadata: Option<JsonValue>,
    profile_picture_url: Option<String>,
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
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<EntityPayload>,
) -> Result<impl IntoResponse, Error> {
    // TODO add user id to the entity in DB
    let entity = sqlx::query_as!(
        Entity,
        "
INSERT INTO entities (pk_namespace, pk, title, metadata, profile_picture_url, user_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING pk_namespace,
    pk,
    title,
    metadata,
    created_at,
    profile_picture_url,
    user_id",
        payload.pk_namespace,
        payload.pk,
        payload.title,
        payload.metadata,
        payload.profile_picture_url,
        user.id
    )
    .fetch_one(&state.db)
    .await
    .map_error(&format!(
        "entity with pk_namespace '{}' and pk '{}'",
        payload.pk_namespace, payload.pk
    ))?;

    Ok((StatusCode::CREATED, Json(entity)))
}

#[derive(Deserialize, Debug)]
pub struct EntityQueryParams {
    parents: Option<bool>,
    children: Option<bool>,
}

#[derive(Serialize)]
struct EntityWithParentsAndChildren {
    entity: Entity,
    parents: Option<Vec<Entity>>,
    children: Option<Vec<Entity>>,
}

async fn get_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
    Query(params): Query<EntityQueryParams>,
) -> Result<impl IntoResponse, Error> {
    let include_parents = params.parents.unwrap_or(false);
    let include_children = params.children.unwrap_or(false);

    let entity = sqlx::query_as!(
        Entity,
        "
SELECT pk_namespace,
    pk,
    title,
    metadata,
    created_at,
    profile_picture_url,
    user_id
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

    let parents = if include_parents {
        let parents = sqlx::query_as!(
            Entity,
            "
SELECT e.*
FROM entities e
    JOIN entity_relationships er ON e.pk_namespace = er.parent_pk_namespace
    AND e.pk = er.parent_pk
WHERE er.child_pk_namespace = $1
    AND er.child_pk = $2",
            pk_namespace,
            pk
        )
        .fetch_all(&state.db)
        .await
        .map_error(&format!("entity parents for {}/{}", pk_namespace, pk))?;

        Some(parents)
    } else {
        None
    };
    let children = if include_children {
        let children = sqlx::query_as!(
            Entity,
            "
SELECT e.*
FROM entities e
    JOIN entity_relationships er ON e.pk_namespace = er.child_pk_namespace
    AND e.pk = er.child_pk
WHERE er.parent_pk_namespace = $1
    AND er.parent_pk = $2
            ",
            pk_namespace,
            pk
        )
        .fetch_all(&state.db)
        .await
        .map_error(&format!("entity children for {}/{}", pk_namespace, pk))?;

        Some(children)
    } else {
        None
    };

    Ok(Json(EntityWithParentsAndChildren {
        entity,
        parents,
        children,
    }))
}

async fn list_entities(State(state): State<AppState>) -> Result<impl IntoResponse, Error> {
    let entities = sqlx::query_as!(
        Entity,
        "
SELECT pk_namespace,
    pk,
    title,
    metadata,
    created_at,
    profile_picture_url,
    user_id
FROM entities
ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .map_error("entities")?;

    Ok((StatusCode::OK, Json(entities)))
}

async fn update_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
    AuthenticatedUser(user): AuthenticatedUser,
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
    metadata = $4,
    profile_picture_url = $5,
    user_id = $6
WHERE pk_namespace = $1
    AND pk = $2
RETURNING pk_namespace,
    pk,
    title,
    metadata,
    created_at,
    profile_picture_url,
    user_id",
        pk_namespace,
        pk,
        payload.title,
        payload.metadata,
        payload.profile_picture_url,
        user.id
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
    // TODO only delete entity if user is the owner
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
