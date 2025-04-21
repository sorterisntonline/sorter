use axum::{
    Router,
    extract::{Extension, Json, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use bcrypt::{DEFAULT_COST, hash, verify};
use chrono::{NaiveDateTime, Utc};
use log::{debug, info, warn};
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

use crate::{
    app_state::AppState,
    models::{Error, IntoNotFound, MapError, MapErrorSqlx, User},
};

const API_KEY_PREFIX: &str = "sort";
const IDENTIFIER_LENGTH: usize = 16;
const SECRET_LENGTH: usize = 32;
const KEY_SEPARATOR: char = '_';

#[derive(FromRow, Debug, Clone)]
pub struct ApiKeyDb {
    pub id: i32,
    pub auth0_sub: String,
    pub name: String,
    pub key_identifier: String,
    pub hashed_key: String,
    pub created_at: NaiveDateTime,
    pub last_used_at: Option<NaiveDateTime>,
    pub active: bool,
}

#[derive(Serialize, Debug)]
pub struct ApiKeyResponse {
    pub id: i32,
    pub auth0_sub: String,
    pub name: String,
    pub created_at: NaiveDateTime,
    pub last_used_at: Option<NaiveDateTime>,
    pub active: bool,
}

impl From<ApiKeyDb> for ApiKeyResponse {
    fn from(db_key: ApiKeyDb) -> Self {
        ApiKeyResponse {
            id: db_key.id,
            auth0_sub: db_key.auth0_sub,
            name: db_key.name,
            created_at: db_key.created_at,
            last_used_at: db_key.last_used_at,
            active: db_key.active,
        }
    }
}

#[derive(Serialize, Debug)]
pub struct NewApiKeyResponse {
    pub name: String,
    pub full_key: String,
    pub message: String,
}

#[derive(Deserialize, Debug)]
pub struct CreateKeyRequest {
    pub name: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct KeyNameRequest {
    pub name: String,
}

pub fn validate_key_name(name: &str) -> Result<(), Error> {
    if name.trim().is_empty() || name.len() > 255 {
        return Err(Error::BadRequest {
            message: "invalid key name".into(),
        });
    }

    Ok(())
}

pub fn generate_api_key() -> (String, String) {
    let identifier: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(IDENTIFIER_LENGTH)
        .map(char::from)
        .collect();
    let secret: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(SECRET_LENGTH)
        .map(char::from)
        .collect();

    let full_key = format!(
        "{}{}{}{}{}",
        API_KEY_PREFIX, KEY_SEPARATOR, identifier, KEY_SEPARATOR, secret
    );
    (identifier, full_key)
}

pub fn create_key_preview(identifier: &str) -> String {
    let preview_len = std::cmp::min(4, identifier.len());
    format!(
        "{}{}{}...",
        API_KEY_PREFIX,
        KEY_SEPARATOR,
        &identifier[..preview_len]
    )
}

pub fn hash_api_key(full_key: &str) -> Result<String, Error> {
    hash(full_key, DEFAULT_COST).map_internal()
}

fn parse_key_identifier(full_key: &str) -> Result<String, Error> {
    if !full_key.starts_with(&format!("{}{}", API_KEY_PREFIX, KEY_SEPARATOR)) {
        return Err(Error::InvalidKeyFormat);
    }

    let parts: Vec<&str> = full_key.splitn(3, KEY_SEPARATOR).collect();
    if parts.len() != 3 || parts[0] != API_KEY_PREFIX || parts[1].len() != IDENTIFIER_LENGTH {
        return Err(Error::InvalidKeyFormat);
    }

    Ok(parts[1].to_string())
}

pub async fn get_user_by_auth0_sub(pool: &PgPool, auth0_sub: &str) -> Result<User, Error> {
    sqlx::query_file_as!(User, "../database/sql/user/select.sql", auth0_sub)
        .fetch_one(pool)
        .await
        .map_error(&format!("user '{auth0_sub}'"))
}

pub async fn verify_api_key(
    pool: &PgPool,
    provided_full_key: &str,
) -> Result<(ApiKeyDb, User), Error> {
    debug!("attempting to verify API key");
    let identifier = parse_key_identifier(provided_full_key)?;
    debug!(identifier; "parsed identifier");

    let key = sqlx::query_file_as!(ApiKeyDb, "../database/sql/key/select.sql", &identifier)
        .fetch_optional(pool)
        .await
        .map_error("key")?
        .ok_or_else(|| {
            warn!(identifier = *identifier; "no active API key found");
            Error::Unauthorized
        })?;

    let key_id = key.id;

    debug!(
        key_id, identifier; "found active key record"
    );

    let is_valid = verify(provided_full_key, &key.hashed_key).map_internal()?;

    if is_valid {
        debug!(key_id; "API key verification successful");

        let user = get_user_by_auth0_sub(pool, &key.auth0_sub).await?;
        debug!(
            user_id:% = user.id, user = user.auth0_sub; "found user"
        );

        Ok((key, user))
    } else {
        warn!(
            key_id = key.id; "API key verification failed due to hash mismatch",
        );

        Err(Error::Unauthorized)
    }
}

pub async fn update_last_used(pool: &PgPool, key_id: i32) -> Result<(), Error> {
    sqlx::query_file!(
        "../database/sql/key/update_last_used.sql",
        Utc::now().naive_utc(),
        key_id
    )
    .execute(pool)
    .await
    .map_internal()?;

    debug!(key_id; "updated last_used_at for key");

    Ok(())
}

async fn list_keys(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<impl IntoResponse, Error> {
    debug!("list_keys called");

    debug!(user = user.auth0_sub; "authenticated user for list_keys");

    let keys = sqlx::query_file_as!(ApiKeyDb, "../database/sql/key/list.sql", user.auth0_sub)
        .fetch_all(&state.db)
        .await
        .map_error("key")?;

    let response_keys: Vec<ApiKeyResponse> = keys.into_iter().map(ApiKeyResponse::from).collect();
    debug!(
        user = user.auth0_sub, key_count = response_keys.len(); "found keys for user"
    );

    Ok((
        StatusCode::OK,
        axum::Json(serde_json::json!({ "api_keys": response_keys })),
    ))
}

async fn create_key(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<CreateKeyRequest>,
) -> Result<(StatusCode, Json<NewApiKeyResponse>), Error> {
    debug!(name = payload.name, user = user.auth0_sub; "create_key called");

    validate_key_name(&payload.name)?;

    let (identifier, full_key) = generate_api_key();
    let hashed_key = hash_api_key(&full_key)?;
    let preview = create_key_preview(&identifier);

    debug!(identifier, preview; "generated identifier and preview");

    sqlx::query_file!(
        "../database/sql/key/insert.sql",
        user.auth0_sub,
        payload.name,
        &identifier,
        &hashed_key,
        Utc::now().naive_utc()
    )
    .execute(&state.db)
    .await
    .map_error("key")?;

    info!(
        name = *payload.name, user = *user.auth0_sub; "created API key"
    );

    Ok((
        StatusCode::CREATED,
        axum::Json(NewApiKeyResponse {
            name: payload.name.clone(),
            full_key,
            message: "API key created successfully. Store it securely, it will not be shown again."
                .to_string(),
        }),
    ))
}

async fn revoke_key(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<KeyNameRequest>,
) -> Result<impl IntoResponse, Error> {
    debug!(name = payload.name; "revoke_key called");

    let object = format!("active API key named '{}'", payload.name);

    sqlx::query_file!(
        "../database/sql/key/revoke.sql",
        Utc::now().naive_utc(),
        user.auth0_sub,
        payload.name
    )
    .execute(&state.db)
    .await
    .map_error(&object)?
    .catch_not_found(&object)?;

    info!(
        name = payload.name, user = user.auth0_sub; "revoked API key"
    );

    Ok(axum::Json(
        serde_json::json!({ "message": "API key revoked successfully." }),
    ))
}

async fn regenerate_key(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<KeyNameRequest>,
) -> Result<impl IntoResponse, Error> {
    validate_key_name(&payload.name)?;

    let _ = revoke_key(
        State(state.clone()),
        Extension(user.clone()),
        Json(payload.clone()),
    )
    .await;
    let (_, key) = create_key(
        State(state),
        Extension(user),
        Json(CreateKeyRequest {
            name: payload.name.clone(),
        }),
    )
    .await?;

    Ok((
        StatusCode::OK,
        axum::Json(NewApiKeyResponse {
            name: key.name.clone(),
            full_key: key.full_key.clone(),
            message: "API key regenerated successfully. Store it securely.".to_string(),
        }),
    ))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_keys).post(create_key))
        .route("/revoke", post(revoke_key))
        .route("/regenerate", post(regenerate_key))
}
