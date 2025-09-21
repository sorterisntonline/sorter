use aide::axum::{ApiRouter, routing::get_with};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::NaiveDateTime;
use log::debug;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{PgExecutor, query_file_as};
use ts_rs::TS;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, IntoNotFound, Json, MapErrorAnyhow, MapErrorSqlx, PgAcquire},
};

#[derive(Serialize, Debug, sqlx::FromRow, Clone, JsonSchema, TS)]
#[ts(export)]
pub struct Entity {
    pub user_id: Uuid,
    pub ns: String,
    pub pk: String,
    pub title: Option<String>,
    pub profile_picture_url: Option<String>,
    #[sqlx(json)]
    #[ts(type = "Record<string, unknown>")]
    pub metadata: Option<JsonValue>,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct EntityPayload {
    pub ns: String,
    pub pk: String,
    pub title: Option<String>,
    #[ts(type = "Record<string, unknown>")]
    pub metadata: Option<JsonValue>,
    pub profile_picture_url: Option<String>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct EntityQueryParams {
    parents: Option<bool>,
    children: Option<bool>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct EntityCreateQueryParams {
    upsert: Option<bool>,
}

#[derive(Serialize, JsonSchema, TS)]
#[ts(export)]
pub struct EntityWithParentsAndChildren {
    pub entity: Entity,
    parents: Option<Vec<Entity>>,
    children: Option<Vec<Entity>>,
}

#[derive(Deserialize, JsonSchema, TS)]
#[ts(export)]
pub struct EntityPath {
    pub ns: String,
    pub pk: String,
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route(
            "/",
            get_with(list_entities, |op| {
                op.description("List all entities.")
                    .response::<200, Json<Vec<Entity>>>()
            })
            .post_with(post_route, |op| {
                op.description("Create a new entity.")
                    .response::<201, Json<Entity>>()
                    .response::<200, Json<Entity>>()
            }),
        )
        .api_route(
            "/{ns}/{pk}",
            get_with(get_route, |op| {
                op.description("Get an entity.")
                    .response::<200, Json<EntityWithParentsAndChildren>>()
            })
            .put_with(put_route, |op| {
                op.description("Update an entity.")
                    .response::<200, Json<Entity>>()
            })
            .delete_with(delete_entity, |op| {
                op.description("Delete an entity.").response::<204, ()>()
            }),
        )
}

pub async fn get_entity<'a, A: PgAcquire<'a>>(
    acquire: A,
    include_parents: bool,
    include_children: bool,
    ns: &str,
    pk: &str,
) -> Result<EntityWithParentsAndChildren, Error> {
    let mut tx = acquire.begin().await.map_internal()?;

    let entity = query_file_as!(Entity, "../database/sql/entity/select.sql", ns, pk)
        .fetch_one(&mut *tx)
        .await
        .map_error("entity")?;

    let parents = if include_parents {
        let parents = query_file_as!(Entity, "../database/sql/entity/select_parents.sql", ns, pk)
            .fetch_all(&mut *tx)
            .await
            .map_error(&format!("entity parents for {}/{}", ns, pk))?;

        Some(parents)
    } else {
        None
    };

    let children = if include_children {
        let children = query_file_as!(Entity, "../database/sql/entity/select_children.sql", ns, pk)
            .fetch_all(&mut *tx)
            .await
            .map_error(&format!("entity children for {}/{}", ns, pk))?;

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
    ns: &str,
    pk: &str,
    title: Option<&str>,
    profile_picture_url: Option<&str>,
    metadata: Option<&JsonValue>,
    user_id: Uuid,
) -> Result<Entity, Error> {
    debug!(
        ns,
        pk,
        title,
        profile_picture_url;
        "creating entity",
    );

    query_file_as!(
        Entity,
        "../database/sql/entity/insert.sql",
        ns,
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
    ns: &str,
    pk: &str,
    title: Option<&str>,
    profile_picture_url: Option<&str>,
    metadata: Option<&JsonValue>,
    user_id: Uuid,
) -> Result<Option<Entity>, Error> {
    debug!(
        ns,
        pk,
        title,
        profile_picture_url;
        "creating entity",
    );

    query_file_as!(
        Entity,
        "../database/sql/entity/insert_ignore_conflict.sql",
        ns,
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

pub async fn upsert_entity<'e, E: PgExecutor<'e>>(
    executor: E,
    ns: &str,
    pk: &str,
    title: Option<&str>,
    profile_picture_url: Option<&str>,
    metadata: Option<&JsonValue>,
    user_id: Uuid,
) -> Result<Entity, Error> {
    debug!(
        ns,
        pk,
        title,
        profile_picture_url;
        "upserting entity",
    );

    query_file_as!(
        Entity,
        "../database/sql/entity/upsert.sql",
        ns,
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

pub async fn update_entity<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: &EntityPayload,
    user_id: Uuid,
) -> Result<Entity, Error> {
    let entity = query_file_as!(
        Entity,
        "../database/sql/entity/update.sql",
        payload.ns,
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
    Query(params): Query<EntityCreateQueryParams>,
    Json(payload): Json<EntityPayload>,
) -> Result<(StatusCode, Json<Entity>), Error> {
    if params.upsert.unwrap_or(false) {
        let entity = upsert_entity(
            &state.db,
            &payload.ns,
            &payload.pk,
            payload.title.as_deref(),
            payload.profile_picture_url.as_deref(),
            payload.metadata.as_ref(),
            user.id,
        )
        .await?;
        Ok((StatusCode::OK, Json(entity)))
    } else {
        let entity = create_entity(
            &state.db,
            &payload.ns,
            &payload.pk,
            payload.title.as_deref(),
            payload.profile_picture_url.as_deref(),
            payload.metadata.as_ref(),
            user.id,
        )
        .await?;

        Ok((StatusCode::CREATED, Json(entity)))
    }
}

async fn get_route(
    State(state): State<AppState>,
    Path(path): Path<EntityPath>,
    Query(params): Query<EntityQueryParams>,
) -> Result<Json<EntityWithParentsAndChildren>, Error> {
    Ok(Json(
        get_entity(
            &state.db,
            params.parents.unwrap_or(false),
            params.children.unwrap_or(false),
            &path.ns,
            &path.pk,
        )
        .await?,
    ))
}

async fn list_entities(
    State(state): State<AppState>,
) -> Result<(StatusCode, Json<Vec<Entity>>), Error> {
    let entities = query_file_as!(Entity, "../database/sql/entity/list.sql")
        .fetch_all(&state.db)
        .await
        .map_error("entities")?;

    Ok((StatusCode::OK, Json(entities)))
}

async fn put_route(
    State(state): State<AppState>,
    Path(path): Path<EntityPath>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<EntityPayload>,
) -> Result<(StatusCode, Json<Entity>), Error> {
    if path.ns != payload.ns || path.pk != payload.pk {
        return Err(Error::BadRequest {
            message: "path parameters must match payload primary key".into(),
        });
    }

    let entity = update_entity(&state.db, &payload, user.id).await?;

    Ok((StatusCode::OK, Json(entity)))
}

async fn delete_entity(
    State(state): State<AppState>,
    AuthenticatedUser(_user): AuthenticatedUser,
    Path(path): Path<EntityPath>,
) -> Result<StatusCode, Error> {
    // TODO only delete entity if user is the owner
    sqlx::query_file!("../database/sql/entity/delete.sql", path.ns, path.pk)
        .execute(&state.db)
        .await
        .map_internal()?
        .catch_not_found("entity")?;

    Ok(StatusCode::NO_CONTENT)
}
