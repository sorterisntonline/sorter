use std::collections::HashMap;

use aide::axum::{
    ApiRouter,
    routing::{get_with, post_with, put_with},
};
use axum::{
    extract::{Path, State},
    http::StatusCode,
};
use chrono::NaiveDateTime;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{query_file_as, types::Uuid};
use ts_rs::TS;

use crate::{
    app_state::AppState,
    entity::Entity,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, Json, MapErrorSqlx},
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, JsonSchema, TS, PartialEq, Eq)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ListActionKind {
    Allow,
    Deny,
    Reset,
    TemporaryBlock,
}

impl ListActionKind {
    fn as_str(self) -> &'static str {
        match self {
            ListActionKind::Allow => "allow",
            ListActionKind::Deny => "deny",
            ListActionKind::Reset => "reset",
            ListActionKind::TemporaryBlock => "temporary_block",
        }
    }
}

fn parse_action_kind(value: &str) -> Result<ListActionKind, Error> {
    match value {
        "allow" => Ok(ListActionKind::Allow),
        "deny" => Ok(ListActionKind::Deny),
        "reset" => Ok(ListActionKind::Reset),
        "temporary_block" => Ok(ListActionKind::TemporaryBlock),
        other => Err(Error::BadRequest {
            message: format!("Unsupported list action '{other}'").into(),
        }),
    }
}

#[derive(Deserialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct ListActionPayload {
    pub list_ns: String,
    pub list_pk: String,
    pub entity_ns: String,
    pub entity_pk: String,
    pub action: ListActionKind,
    pub expires_at: Option<NaiveDateTime>,
}

#[derive(Serialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct ListActionRecord {
    pub id: i64,
    pub user_id: Uuid,
    pub list_ns: String,
    pub list_pk: String,
    pub entity_ns: String,
    pub entity_pk: String,
    pub action: ListActionKind,
    pub created_at: NaiveDateTime,
    pub expires_at: Option<NaiveDateTime>,
}

#[derive(sqlx::FromRow)]
struct ListActionRow {
    id: i64,
    user_id: Uuid,
    list_ns: String,
    list_pk: String,
    entity_ns: String,
    entity_pk: String,
    action: String,
    created_at: NaiveDateTime,
    expires_at: Option<NaiveDateTime>,
}

impl TryFrom<ListActionRow> for ListActionRecord {
    type Error = Error;

    fn try_from(value: ListActionRow) -> Result<Self, Self::Error> {
        Ok(ListActionRecord {
            id: value.id,
            user_id: value.user_id,
            list_ns: value.list_ns,
            list_pk: value.list_pk,
            entity_ns: value.entity_ns,
            entity_pk: value.entity_pk,
            action: parse_action_kind(&value.action)?,
            created_at: value.created_at,
            expires_at: value.expires_at,
        })
    }
}

#[derive(Serialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct ListBehaviorRecord {
    pub list_ns: String,
    pub list_pk: String,
    pub include_by_default: bool,
    pub created_at: Option<NaiveDateTime>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(sqlx::FromRow)]
struct ListBehaviorRow {
    parent_ns: String,
    parent_pk: String,
    include_by_default: bool,
    created_at: Option<NaiveDateTime>,
    updated_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct ListBehaviorPayload {
    pub include_by_default: bool,
}

#[derive(Deserialize, Debug)]
struct ListPath {
    list_ns: String,
    list_pk: String,
}

#[derive(Serialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct ListStateResponse {
    pub include_by_default: bool,
    pub included: Vec<Entity>,
    pub excluded: Vec<Entity>,
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route(
            "/",
            post_with(create_action, |op| {
                op.description("Append a new list action.")
                    .response::<201, Json<ListActionRecord>>()
            }),
        )
        .api_route(
            "/{list_ns}/{list_pk}",
            get_with(get_list_state, |op| {
                op.description("Fetch the resolved list state for the authenticated user.")
                    .response::<200, Json<ListStateResponse>>()
            }),
        )
        .api_route(
            "/{list_ns}/{list_pk}/behavior",
            get_with(get_list_behavior, |op| {
                op.description("Fetch list behavior configuration.")
                    .response::<200, Json<ListBehaviorRecord>>()
            })
            .put_with(upsert_list_behavior_route, |op| {
                op.description("Set list behavior configuration.")
                    .response::<200, Json<ListBehaviorRecord>>()
            }),
        )
}

async fn create_action(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<ListActionPayload>,
) -> Result<(StatusCode, Json<ListActionRecord>), Error> {
    let row = query_file_as!(
        ListActionRow,
        "../database/sql/list_action/insert.sql",
        user.id,
        payload.list_ns,
        payload.list_pk,
        payload.entity_ns,
        payload.entity_pk,
        payload.action.as_str(),
        payload.expires_at
    )
    .fetch_one(&state.db)
    .await
    .map_error("list action")?;

    let record: ListActionRecord = row.try_into()?;

    Ok((StatusCode::CREATED, Json(record)))
}

async fn upsert_list_behavior_route(
    State(state): State<AppState>,
    AuthenticatedUser(_user): AuthenticatedUser,
    Path(path): Path<ListPath>,
    Json(payload): Json<ListBehaviorPayload>,
) -> Result<(StatusCode, Json<ListBehaviorRecord>), Error> {
    let row = query_file_as!(
        ListBehaviorRow,
        "../database/sql/list_action/upsert_list_behavior.sql",
        path.list_ns,
        path.list_pk,
        payload.include_by_default
    )
    .fetch_one(&state.db)
    .await
    .map_error("list behavior")?;

    Ok((
        StatusCode::OK,
        Json(ListBehaviorRecord {
            list_ns: row.parent_ns,
            list_pk: row.parent_pk,
            include_by_default: row.include_by_default,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }),
    ))
}

async fn get_list_behavior(
    State(state): State<AppState>,
    AuthenticatedUser(_user): AuthenticatedUser,
    Path(path): Path<ListPath>,
) -> Result<(StatusCode, Json<ListBehaviorRecord>), Error> {
    let record = fetch_list_behavior_record(&state, &path.list_ns, &path.list_pk).await?;
    Ok((StatusCode::OK, Json(record)))
}

async fn get_list_state(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Path(path): Path<ListPath>,
) -> Result<(StatusCode, Json<ListStateResponse>), Error> {
    let children = query_file_as!(
        Entity,
        "../database/sql/entity/select_children.sql",
        path.list_ns,
        path.list_pk
    )
    .fetch_all(&state.db)
    .await
    .map_error("entity")?;

    let (include_by_default, entries) =
        resolve_children_membership(&state, user.id, &path.list_ns, &path.list_pk, children)
            .await?;

    let mut included = Vec::new();
    let mut excluded = Vec::new();

    for (entity, is_in) in entries {
        if is_in {
            included.push(entity);
        } else {
            excluded.push(entity);
        }
    }

    Ok((
        StatusCode::OK,
        Json(ListStateResponse {
            include_by_default,
            included,
            excluded,
        }),
    ))
}

async fn fetch_list_behavior_record(
    state: &AppState,
    list_ns: &str,
    list_pk: &str,
) -> Result<ListBehaviorRecord, Error> {
    let row = query_file_as!(
        ListBehaviorRow,
        "../database/sql/list_action/select_list_behavior.sql",
        list_ns,
        list_pk
    )
    .fetch_optional(&state.db)
    .await
    .map_error("list behavior")?;

    Ok(match row {
        Some(row) => ListBehaviorRecord {
            list_ns: row.parent_ns,
            list_pk: row.parent_pk,
            include_by_default: row.include_by_default,
            created_at: row.created_at,
            updated_at: row.updated_at,
        },
        None => ListBehaviorRecord {
            list_ns: list_ns.to_string(),
            list_pk: list_pk.to_string(),
            include_by_default: true,
            created_at: None,
            updated_at: None,
        },
    })
}

async fn fetch_list_behavior(
    state: &AppState,
    list_ns: &str,
    list_pk: &str,
) -> Result<bool, Error> {
    Ok(fetch_list_behavior_record(state, list_ns, list_pk)
        .await?
        .include_by_default)
}

async fn fetch_latest_actions(
    state: &AppState,
    user_id: Uuid,
    list_ns: &str,
    list_pk: &str,
) -> Result<HashMap<(String, String), ListActionKind>, Error> {
    let rows = query_file_as!(
        ListActionRow,
        "../database/sql/list_action/select_latest_actions.sql",
        user_id,
        list_ns,
        list_pk
    )
    .fetch_all(&state.db)
    .await
    .map_error("list action")?;

    let mut map = HashMap::with_capacity(rows.len());
    for row in rows {
        let action = parse_action_kind(&row.action)?;
        map.insert((row.entity_ns, row.entity_pk), action);
    }

    Ok(map)
}

fn apply_action(action: ListActionKind, default_include: bool) -> bool {
    match action {
        ListActionKind::Allow => true,
        ListActionKind::Deny => false,
        ListActionKind::TemporaryBlock => false,
        ListActionKind::Reset => default_include,
    }
}

pub async fn resolve_children_membership(
    state: &AppState,
    user_id: Uuid,
    list_ns: &str,
    list_pk: &str,
    children: Vec<Entity>,
) -> Result<(bool, Vec<(Entity, bool)>), Error> {
    let include_by_default = fetch_list_behavior(state, list_ns, list_pk).await?;
    let latest_actions = fetch_latest_actions(state, user_id, list_ns, list_pk).await?;

    let mut result = Vec::with_capacity(children.len());
    for child in children.into_iter() {
        let key = (child.ns.clone(), child.pk.clone());
        let is_in = latest_actions
            .get(&key)
            .map(|action| apply_action(*action, include_by_default))
            .unwrap_or(include_by_default);
        result.push((child, is_in));
    }

    Ok((include_by_default, result))
}
