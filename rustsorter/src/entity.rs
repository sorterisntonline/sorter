use axum::{
    Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use chrono::NaiveDateTime;
use log::debug;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{PgExecutor, query_file_as};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, IntoNotFound, Json, MapErrorAnyhow, MapErrorSqlx, PgAcquire},
};

#[derive(Serialize, Debug, sqlx::FromRow, Clone)]
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
    pub pk_namespace: String,
    pub pk: String,
    pub title: Option<String>,
    pub metadata: Option<JsonValue>,
    pub profile_picture_url: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct EntityQueryParams {
    parents: Option<bool>,
    children: Option<bool>,
}

#[derive(Serialize)]
pub struct EntityWithParentsAndChildren {
    pub entity: Entity,
    parents: Option<Vec<Entity>>,
    children: Option<Vec<Entity>>,
}

pub fn public_routes() -> Router<AppState> {
    Router::new().route("/", get(list_entities))
}

pub fn protected_routes() -> Router<AppState> {
    Router::new().route("/", post(post_route)).route(
        "/:pk_namespace/:pk",
        get(get_route).put(put_route).delete(delete_entity),
    )
}

pub async fn get_entity<'a, A: PgAcquire<'a>>(
    acquire: A,
    include_parents: bool,
    include_children: bool,
    pk_namespace: &str,
    pk: &str,
) -> Result<EntityWithParentsAndChildren, Error> {
    let mut tx = acquire.begin().await.map_internal()?;

    let entity = query_file_as!(
        Entity,
        "../database/sql/entity/select.sql",
        pk_namespace,
        pk
    )
    .fetch_one(&mut *tx)
    .await
    .map_error("entity")?;

    let parents = if include_parents {
        let parents = query_file_as!(
            Entity,
            "../database/sql/entity/select_parents.sql",
            pk_namespace,
            pk
        )
        .fetch_all(&mut *tx)
        .await
        .map_error(&format!("entity parents for {}/{}", pk_namespace, pk))?;

        Some(parents)
    } else {
        None
    };

    let children = if include_children {
        let children = query_file_as!(
            Entity,
            "../database/sql/entity/select_children.sql",
            pk_namespace,
            pk
        )
        .fetch_all(&mut *tx)
        .await
        .map_error(&format!("entity children for {}/{}", pk_namespace, pk))?;

        Some(children)
    } else {
        None
    };

    tx.commit().await.map_internal()?;

    Ok(EntityWithParentsAndChildren {
        entity,
        parents,
        children,
    })
}

pub async fn create_entity<'e, E: PgExecutor<'e>>(
    executor: E,
    pk_namespace: &str,
    pk: &str,
    title: Option<&str>,
    profile_picture_url: Option<&str>,
    metadata: Option<&JsonValue>,
    user_id: Uuid,
) -> Result<Entity, Error> {
    debug!(
        pk_namespace,
        pk,
        title,
        profile_picture_url;
        "creating entity",
    );

    query_file_as!(
        Entity,
        "../database/sql/entity/insert.sql",
        pk_namespace,
        pk,
        title,
        metadata,
        profile_picture_url,
        user_id
    )
    .fetch_one(executor)
    .await
    .map_error("entity")
}

pub async fn create_entity_ignore_conflict<'e, E: PgExecutor<'e>>(
    executor: E,
    pk_namespace: &str,
    pk: &str,
    title: Option<&str>,
    profile_picture_url: Option<&str>,
    metadata: Option<&JsonValue>,
    user_id: Uuid,
) -> Result<Option<Entity>, Error> {
    debug!(
        pk_namespace,
        pk,
        title,
        profile_picture_url;
        "creating entity",
    );

    query_file_as!(
        Entity,
        "../database/sql/entity/insert_ignore_conflict.sql",
        pk_namespace,
        pk,
        title,
        metadata,
        profile_picture_url,
        user_id
    )
    .fetch_optional(executor)
    .await
    .map_error("entity")
}

pub async fn update_entity<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: &EntityPayload,
    user_id: Uuid,
) -> Result<Entity, Error> {
    let entity = query_file_as!(
        Entity,
        "../database/sql/entity/update.sql",
        payload.pk_namespace,
        payload.pk,
        payload.title,
        payload.metadata,
        payload.profile_picture_url,
        user_id
    )
    .fetch_optional(executor)
    .await
    .map_internal()?
    .catch_not_found("entity")?;

    Ok(entity)
}

async fn post_route(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<EntityPayload>,
) -> Result<impl IntoResponse, Error> {
    let entity = update_entity(&state.db, &payload, user.id).await?;

    Ok((StatusCode::CREATED, Json(entity)))
}

async fn get_route(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
    Query(params): Query<EntityQueryParams>,
) -> Result<impl IntoResponse, Error> {
    Ok(Json(
        get_entity(
            &state.db,
            params.parents.unwrap_or(false),
            params.children.unwrap_or(false),
            &pk_namespace,
            &pk,
        )
        .await?,
    ))
}

async fn list_entities(State(state): State<AppState>) -> Result<impl IntoResponse, Error> {
    let entities = query_file_as!(Entity, "../database/sql/entity/list.sql")
        .fetch_all(&state.db)
        .await
        .map_error("entities")?;

    Ok((StatusCode::OK, Json(entities)))
}

async fn put_route(
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

    let entity = update_entity(&state.db, &payload, user.id).await?;

    Ok((StatusCode::OK, Json(entity)))
}

async fn delete_entity(
    State(state): State<AppState>,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, Error> {
    // TODO only delete entity if user is the owner
    sqlx::query_file!("../database/sql/entity/delete.sql", pk_namespace, pk)
        .execute(&state.db)
        .await
        .map_internal()?
        .catch_not_found("entity")?;

    Ok(StatusCode::NO_CONTENT)
}
