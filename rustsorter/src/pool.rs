use aide::axum::{routing::{get, post, delete}, ApiRouter};
use axum::extract::{Path, Query, State};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid;

use ts_rs::TS;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, Json, MapErrorSqlx},
};

#[derive(Debug, Clone, Serialize, JsonSchema, TS)]
#[ts(export)]
pub struct PoolStatus {
    pub entity_ns: String,
    pub entity_pk: String,
    pub status: PoolMembershipStatus,
    pub status_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema, TS)]
#[ts(export)]
pub enum PoolMembershipStatus {
    #[serde(rename = "unclassified")]
    Unclassified, // NULL in database
    #[serde(rename = "in_pool")]
    InPool, // true in database
    #[serde(rename = "blocked")]
    Blocked, // false in database
}

#[derive(Debug, Clone, Serialize, JsonSchema, TS)]
#[ts(export)]
pub struct EntityWithPoolStatus {
    pub ns: String,
    pub pk: String,
    pub title: Option<String>,
    pub profile_picture_url: Option<String>,
    #[ts(type = "any")]
    pub metadata: Option<serde_json::Value>,
    pub pool_status: PoolMembershipStatus,
    pub status_updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize, JsonSchema, TS)]
#[ts(export)]
pub struct ListPoolQuery {
    pub ns: Option<String>,
    pub pks: Option<Vec<String>>,
    pub status: Option<PoolMembershipStatus>,
}

#[derive(Debug, Deserialize, JsonSchema, TS)]
#[ts(export)]
pub struct BatchPoolOperation {
    pub operations: Vec<PoolOperation>,
}

#[derive(Debug, Deserialize, JsonSchema, TS)]
#[ts(export)]
pub struct PoolOperation {
    pub entity_ns: String,
    pub entity_pk: String,
    pub action: PoolAction,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema, TS)]
#[ts(export)]
pub enum PoolAction {
    #[serde(rename = "add")]
    Add, // Set in_pool = true
    #[serde(rename = "block")]
    Block, // Set in_pool = false
    #[serde(rename = "remove")]
    Remove, // Delete record (return to NULL)
}

#[derive(Debug, Serialize, JsonSchema, TS)]
#[ts(export)]
pub struct BatchPoolResult {
    pub success_count: usize,
    pub failed_operations: Vec<FailedPoolOperation>,
}

#[derive(Debug, Serialize, JsonSchema, TS)]
#[ts(export)]
pub struct FailedPoolOperation {
    pub entity_ns: String,
    pub entity_pk: String,
    pub action: PoolAction,
    pub error: String,
}

/// Get pool membership status for a specific entity
async fn get_pool_status_handler(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path((ns, pk)): Path<(String, String)>,
) -> Result<Json<PoolStatus>, Error> {
    let row = sqlx::query_file!("../database/sql/pool/get_status.sql", user.id, ns, pk)
        .fetch_optional(&state.db)
        .await
        .map_error("pool_status")?;

    let (status, status_updated_at) = match row {
        Some(row) => {
            let status = if row.in_pool {
                PoolMembershipStatus::InPool
            } else {
                PoolMembershipStatus::Blocked
            };
            (status, Some(row.created_at))
        }
        None => (PoolMembershipStatus::Unclassified, None),
    };

    Ok(Json(PoolStatus {
        entity_ns: ns,
        entity_pk: pk,
        status,
        status_updated_at,
    }))
}

/// Add entity to pool (set in_pool = true)
async fn add_to_pool_handler(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path((ns, pk)): Path<(String, String)>,
) -> Result<Json<PoolStatus>, Error> {
    let row = sqlx::query_file!("../database/sql/pool/upsert_membership.sql", user.id, ns, pk, true)
        .fetch_one(&state.db)
        .await
        .map_error("add_to_pool")?;

    Ok(Json(PoolStatus {
        entity_ns: ns,
        entity_pk: pk,
        status: PoolMembershipStatus::InPool,
        status_updated_at: Some(row.created_at),
    }))
}

/// Block entity from pool (set in_pool = false)
async fn block_from_pool_handler(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path((ns, pk)): Path<(String, String)>,
) -> Result<Json<PoolStatus>, Error> {
    let row = sqlx::query_file!("../database/sql/pool/upsert_membership.sql", user.id, ns, pk, false)
        .fetch_one(&state.db)
        .await
        .map_error("block_from_pool")?;

    Ok(Json(PoolStatus {
        entity_ns: ns,
        entity_pk: pk,
        status: PoolMembershipStatus::Blocked,
        status_updated_at: Some(row.created_at),
    }))
}

/// Remove entity from pool (delete record, return to NULL state)
async fn remove_from_pool_handler(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path((ns, pk)): Path<(String, String)>,
) -> Result<Json<PoolStatus>, Error> {
    sqlx::query_file!("../database/sql/pool/delete_membership.sql", user.id, ns, pk)
        .fetch_optional(&state.db)
        .await
        .map_error("remove_from_pool")?;

    Ok(Json(PoolStatus {
        entity_ns: ns,
        entity_pk: pk,
        status: PoolMembershipStatus::Unclassified,
        status_updated_at: None,
    }))
}

/// List entities with their pool status
async fn list_pool_handler(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(query): Query<ListPoolQuery>,
) -> Result<Json<Vec<EntityWithPoolStatus>>, Error> {
    let ns = query.ns.as_deref();
    let pks = query.pks.as_deref();

    let rows = sqlx::query_file!("../database/sql/pool/list_with_status.sql", user.id, ns, pks)
        .fetch_all(&state.db)
        .await
        .map_error("list_pool")?;

    let entities = rows
        .into_iter()
        .map(|row| {
            let pool_status = match row.pool_status.as_deref() {
                Some("in_pool") => PoolMembershipStatus::InPool,
                Some("blocked") => PoolMembershipStatus::Blocked,
                _ => PoolMembershipStatus::Unclassified,
            };

            EntityWithPoolStatus {
                ns: row.ns,
                pk: row.pk,
                title: row.title,
                profile_picture_url: row.profile_picture_url,
                metadata: row.metadata,
                pool_status,
                status_updated_at: Some(row.status_updated_at),
            }
        })
        .filter(|entity| {
            // Apply status filter if specified
            query.status.as_ref().map_or(true, |status| {
                std::mem::discriminant(&entity.pool_status) == std::mem::discriminant(status)
            })
        })
        .collect();

    Ok(Json(entities))
}

/// Batch pool operations
async fn batch_pool_handler(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(batch): Json<BatchPoolOperation>,
) -> Result<Json<BatchPoolResult>, Error> {
    let mut success_count = 0;
    let mut failed_operations = Vec::new();

    for operation in batch.operations {
        let result = match operation.action {
            PoolAction::Add => {
                sqlx::query!(
                    r#"
                    INSERT INTO entity_pool_membership (user_id, entity_ns, entity_pk, in_pool)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, entity_ns, entity_pk)
                    DO UPDATE SET 
                      in_pool = EXCLUDED.in_pool,
                      created_at = now()
                    "#,
                    user.id,
                    operation.entity_ns,
                    operation.entity_pk,
                    true
                )
                .execute(&state.db)
                .await
            }
            PoolAction::Block => {
                sqlx::query!(
                    r#"
                    INSERT INTO entity_pool_membership (user_id, entity_ns, entity_pk, in_pool)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (user_id, entity_ns, entity_pk)
                    DO UPDATE SET 
                      in_pool = EXCLUDED.in_pool,
                      created_at = now()
                    "#,
                    user.id,
                    operation.entity_ns,
                    operation.entity_pk,
                    false
                )
                .execute(&state.db)
                .await
            }
            PoolAction::Remove => {
                sqlx::query!(
                    r#"
                    DELETE FROM entity_pool_membership
                    WHERE user_id = $1 
                      AND entity_ns = $2 
                      AND entity_pk = $3
                    "#,
                    user.id,
                    operation.entity_ns,
                    operation.entity_pk
                )
                .execute(&state.db)
                .await
            }
        };

        match result {
            Ok(_) => success_count += 1,
            Err(e) => failed_operations.push(FailedPoolOperation {
                entity_ns: operation.entity_ns,
                entity_pk: operation.entity_pk,
                action: operation.action,
                error: e.to_string(),
            }),
        }
    }

    Ok(Json(BatchPoolResult {
        success_count,
        failed_operations,
    }))
}

/// Check if entities are in a user's pool
/// Used by pair selection logic to filter eligible entities
/// Set pool membership status for an entity
pub async fn set_pool_membership(
    db: &sqlx::PgPool,
    user_id: Uuid,
    entity_ns: &str,
    entity_pk: &str,
    in_pool: bool,
) -> Result<(), Error> {
    sqlx::query_file!("../database/sql/pool/upsert_membership.sql", user_id, entity_ns, entity_pk, in_pool)
        .fetch_one(db)
        .await
        .map_error("set_pool_membership")?;
    
    Ok(())
}

pub async fn filter_entities_by_pool(
    state: &AppState,
    user_id: Uuid,
    entities: &[crate::entity::Entity],
    include_status: PoolMembershipStatus,
) -> Result<Vec<crate::entity::Entity>, Error> {
    if entities.is_empty() {
        return Ok(Vec::new());
    }

    // Build arrays for the batch query
    let entity_namespaces: Vec<String> = entities.iter().map(|e| e.ns.clone()).collect();
    let entity_keys: Vec<String> = entities.iter().map(|e| e.pk.clone()).collect();

    let rows = sqlx::query!(
        r#"
        SELECT entity_ns, entity_pk, in_pool
        FROM entity_pool_membership
        WHERE user_id = $1
          AND entity_ns = ANY($2)
          AND entity_pk = ANY($3)
        "#,
        user_id,
        &entity_namespaces,
        &entity_keys
    )
    .fetch_all(&state.db)
    .await
    .map_error("filter_entities_by_pool")?;

    // Build lookup map for pool membership
    let mut pool_status_map = std::collections::HashMap::new();
    for row in rows {
        pool_status_map.insert(
            (row.entity_ns, row.entity_pk),
            if row.in_pool {
                PoolMembershipStatus::InPool
            } else {
                PoolMembershipStatus::Blocked
            },
        );
    }

    // Filter entities based on desired status
    let filtered = entities
        .iter()
        .filter(|entity| {
            let key = (entity.ns.clone(), entity.pk.clone());
            let actual_status = pool_status_map
                .get(&key)
                .unwrap_or(&PoolMembershipStatus::Unclassified);

            std::mem::discriminant(actual_status) == std::mem::discriminant(&include_status)
        })
        .cloned()
        .collect();

    Ok(filtered)
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/{ns}/{pk}", get(get_pool_status_handler))
        .api_route("/{ns}/{pk}/add", post(add_to_pool_handler))
        .api_route("/{ns}/{pk}/block", post(block_from_pool_handler))
        .api_route("/{ns}/{pk}/remove", delete(remove_from_pool_handler))
        .api_route("/list", get(list_pool_handler))
        .api_route("/batch", post(batch_pool_handler))
}
