use axum::{
    Router,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Extension,
    debug_handler,
};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{ErrorResponse, Json},
    extractors::maybe_user::{AuthenticatedUser, MaybeUser},
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

#[debug_handler]
async fn create_entity(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<EntityPayload>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // TODO add user id to the entity in DB
    match sqlx::query_as!(
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
) -> Result<impl IntoResponse, ErrorResponse> {
    let include_parents = params.parents.unwrap_or(false);
    let include_children = params.children.unwrap_or(false);

    let entity = match sqlx::query_as!(
        Entity,
        "SELECT * FROM entities WHERE pk_namespace = $1 AND pk = $2",
        pk_namespace,
        pk
    )
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(entity)) => entity,
        Ok(None) => {
            return Err(ErrorResponse::new(
                StatusCode::NOT_FOUND,
                "Entity not found".to_string(),
            ));
        }
        Err(e) => {
            log::error!("Failed to fetch entity: {}", e);
            return Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to fetch entity".to_string(),
            ));
        }
    };

    let mut parents: Option<Vec<Entity>> = None;
    let mut children: Option<Vec<Entity>> = None;

    if include_parents {
        match sqlx::query_as!(
            Entity,
            r#"
            SELECT e.* 
            FROM entities e
            JOIN entity_relationships er ON e.pk_namespace = er.parent_pk_namespace AND e.pk = er.parent_pk
            WHERE er.child_pk_namespace = $1 AND er.child_pk = $2
            "#,
            pk_namespace, pk
        )
        .fetch_all(&state.db)
        .await {
            Ok(p) => parents = Some(p),
            Err(e) => {
                 log::error!("Failed to fetch parents for entity {}/{}: {}", pk_namespace, pk, e);
                  return Err(ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to fetch entity parents".to_string(),
                 ));
            }
        }
    }

    if include_children {
         match sqlx::query_as!(
            Entity,
            r#"
            SELECT e.* 
            FROM entities e
            JOIN entity_relationships er ON e.pk_namespace = er.child_pk_namespace AND e.pk = er.child_pk
            WHERE er.parent_pk_namespace = $1 AND er.parent_pk = $2
            "#,
            pk_namespace, pk
        )
        .fetch_all(&state.db)
        .await {
             Ok(c) => children = Some(c),
             Err(e) => {
                 log::error!("Failed to fetch children for entity {}/{}: {}", pk_namespace, pk, e);
                  return Err(ErrorResponse::new(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to fetch entity children".to_string(),
                 ));
             }
        }
    }
    Ok(Json(EntityWithParentsAndChildren {
        entity,
        parents,
        children,
    }))

}

async fn list_entities(
    MaybeUser(maybe_user): MaybeUser,
    State(state): State<AppState>
) -> Result<impl IntoResponse, ErrorResponse> {
    // TODO query only public entities if user is not authenticated
    match sqlx::query_as!(
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
    AuthenticatedUser(user): AuthenticatedUser,
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
    AuthenticatedUser(user): AuthenticatedUser,
    Path((pk_namespace, pk)): Path<(String, String)>,
) -> Result<impl IntoResponse, ErrorResponse> {
    // TODO only delete entity if user is the owner
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
