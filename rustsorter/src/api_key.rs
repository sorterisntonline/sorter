use std::fmt;

use anyhow::{Context, Result};
use axum::{
    Router,
    extract::{Extension, Json, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use bcrypt::{DEFAULT_COST, hash, verify};
use chrono::{NaiveDateTime, Utc};
use rand::{Rng, distributions::Alphanumeric};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Postgres, Transaction};

use crate::{
    app_state::AppState,
    models::{ErrorResponse, User},
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
    pub full_key: String, /* The plain text key (identifier + secret), ONLY sent on
                           * creation/regeneration */
    pub message: String,
}

#[derive(Deserialize, Debug)]
pub struct CreateKeyRequest {
    pub name: String,
}

#[derive(Deserialize, Debug)]
pub struct KeyNameRequest {
    pub name: String,
}

#[derive(Debug)]
pub enum ApiKeyError {
    DatabaseError(sqlx::Error),
    HashingError(anyhow::Error),
    VerificationError(bcrypt::BcryptError),
    Conflict(String),
    NotFound(String),
    Unauthorized,
    BadRequest(String),
    InvalidKeyFormat,
    InternalError(String),
}

impl fmt::Display for ApiKeyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiKeyError::DatabaseError(e) => write!(f, "Database error: {}", e),
            ApiKeyError::HashingError(e) => write!(f, "Hashing error: {}", e),
            ApiKeyError::VerificationError(e) => write!(f, "Verification failed: {}", e),
            ApiKeyError::Conflict(msg) => write!(f, "Conflict: {}", msg),
            ApiKeyError::NotFound(msg) => write!(f, "Not Found: {}", msg),
            ApiKeyError::Unauthorized => write!(f, "Unauthorized"),
            ApiKeyError::BadRequest(msg) => write!(f, "Bad Request: {}", msg),
            ApiKeyError::InvalidKeyFormat => write!(f, "Invalid API key format"),
            ApiKeyError::InternalError(msg) => write!(f, "Internal server error: {}", msg),
        }
    }
}

impl From<ApiKeyError> for ErrorResponse {
    fn from(error: ApiKeyError) -> Self {
        let (status, error_message) = match &error {
            ApiKeyError::DatabaseError(_)
            | ApiKeyError::HashingError(_)
            | ApiKeyError::InternalError(_)
            | ApiKeyError::VerificationError(_) => {
                log::error!("Internal API Key Error: {}", error);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Internal server error".to_string(),
                )
            }
            ApiKeyError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            ApiKeyError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiKeyError::Unauthorized | ApiKeyError::InvalidKeyFormat => {
                (StatusCode::UNAUTHORIZED, error.to_string())
            }
            ApiKeyError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
        };

        if status != StatusCode::INTERNAL_SERVER_ERROR {
            log::warn!(
                "API Key Response: status={}, message='{}'",
                status,
                error_message
            );
        }

        Self::new(status, error_message)
    }
}

// temporary impl for ApiKeyError to return ErrorResponse until FRI-373 is fixed
impl IntoResponse for ApiKeyError {
    fn into_response(self) -> Response {
        ErrorResponse::from(self).into_response()
    }
}

impl From<sqlx::Error> for ApiKeyError {
    fn from(err: sqlx::Error) -> Self {
        if let sqlx::Error::Database(db_err) = &err {
            if db_err.is_unique_violation() {
                if db_err.constraint() == Some("api_keys_auth0_sub_name_active_key_idx") {
                    return ApiKeyError::Conflict(
                        "An active key with this name already exists.".to_string(),
                    );
                }
                if db_err.constraint() == Some("api_keys_key_identifier_key") {
                    log::error!(
                        "Duplicate key identifier generated and attempted insert: {}",
                        db_err
                    );
                    return ApiKeyError::InternalError(
                        "Failed to generate unique key identifier. Please try again.".to_string(),
                    );
                }
            }
        }
        ApiKeyError::DatabaseError(err)
    }
}

impl From<anyhow::Error> for ApiKeyError {
    fn from(err: anyhow::Error) -> Self {
        ApiKeyError::HashingError(err)
    }
}

impl From<bcrypt::BcryptError> for ApiKeyError {
    fn from(err: bcrypt::BcryptError) -> Self {
        ApiKeyError::VerificationError(err)
    }
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

pub fn hash_api_key(full_key: &str) -> Result<String> {
    hash(full_key, DEFAULT_COST).context("Failed to hash API key")
}

fn parse_key_identifier(full_key: &str) -> Result<String, ApiKeyError> {
    if !full_key.starts_with(&format!("{}{}", API_KEY_PREFIX, KEY_SEPARATOR)) {
        return Err(ApiKeyError::InvalidKeyFormat);
    }

    let parts: Vec<&str> = full_key.splitn(3, KEY_SEPARATOR).collect();
    if parts.len() != 3 || parts[0] != API_KEY_PREFIX || parts[1].len() != IDENTIFIER_LENGTH {
        Err(ApiKeyError::InvalidKeyFormat)
    } else {
        Ok(parts[1].to_string())
    }
}

pub async fn get_user_by_auth0_sub(pool: &PgPool, auth0_sub: &str) -> Result<User, ApiKeyError> {
    sqlx::query_as!(
        User,
        "SELECT auth0_sub, username, id  FROM users WHERE auth0_sub = $1",
        auth0_sub
    )
    .fetch_one(pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::RowNotFound => {
            ApiKeyError::NotFound(format!("User '{}' not found", auth0_sub))
        }
        _ => ApiKeyError::DatabaseError(e),
    })
}

pub async fn verify_api_key(
    pool: &PgPool,
    provided_full_key: &str,
) -> Result<(ApiKeyDb, User), ApiKeyError> {
    log::debug!("Attempting to verify API key");
    let identifier = parse_key_identifier(provided_full_key)?;
    log::debug!("Parsed identifier: {}", identifier);

    let key_candidate = sqlx::query_as!(
        ApiKeyDb,
        "SELECT id, auth0_sub, name, key_identifier, hashed_key, created_at, last_used_at, active
         FROM api_keys
         WHERE key_identifier = $1 AND active = TRUE",
        &identifier
    )
    .fetch_optional(pool)
    .await?;

    match key_candidate {
        Some(key) => {
            log::debug!(
                "Found active key record with id: {} for identifier: {}",
                key.id,
                identifier
            );

            let is_valid = verify(provided_full_key, &key.hashed_key).map_err(ApiKeyError::from)?;

            if is_valid {
                log::debug!("API key verification successful for key id: {}", key.id);

                let user = get_user_by_auth0_sub(pool, &key.auth0_sub).await?;
                log::debug!(
                    "Found user: {} associated with key id: {}",
                    user.auth0_sub,
                    key.id
                );

                Ok((key, user))
            } else {
                log::warn!(
                    "API key verification failed (hash mismatch) for key id: {}",
                    key.id
                );
                Err(ApiKeyError::Unauthorized)
            }
        }
        None => {
            log::warn!("No active API key found for identifier: {}", identifier);
            Err(ApiKeyError::Unauthorized)
        }
    }
}

pub async fn update_last_used(pool: &PgPool, key_id: i32) -> Result<()> {
    sqlx::query!(
        "UPDATE api_keys SET last_used_at = $1 WHERE id = $2",
        Utc::now().naive_utc(),
        key_id
    )
    .execute(pool)
    .await
    .context("Failed to update last_used_at for API key")?;
    log::debug!("Updated last_used_at for key id: {}", key_id);
    Ok(())
}

async fn list_keys(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
) -> Result<impl IntoResponse, ApiKeyError> {
    log::debug!("Handler: list_keys called");

    log::debug!("Authenticated user for list_keys: {}", user.auth0_sub);

    let keys = sqlx::query_as!(
        ApiKeyDb,
        "SELECT id, auth0_sub, name, key_identifier, hashed_key, created_at, last_used_at, active
         FROM api_keys
         WHERE auth0_sub = $1 ORDER BY created_at DESC",
        user.auth0_sub
    )
    .fetch_all(&state.db)
    .await?;

    let response_keys: Vec<ApiKeyResponse> = keys.into_iter().map(ApiKeyResponse::from).collect();
    log::debug!(
        "Found {} keys for user {}",
        response_keys.len(),
        user.auth0_sub
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
) -> Result<impl IntoResponse, ApiKeyError> {
    log::debug!("Handler: create_key called for name: {}", payload.name);

    log::debug!("Authenticated user for create_key: {}", user.auth0_sub);

    if payload.name.trim().is_empty() || payload.name.len() > 255 {
        return Err(ApiKeyError::BadRequest(
            "Invalid key name provided.".to_string(),
        ));
    }

    let (identifier, full_key) = generate_api_key();
    let hashed_key = hash_api_key(&full_key)?;
    let preview = create_key_preview(&identifier);

    log::debug!("Generated identifier: {}, preview: {}", identifier, preview);

    sqlx::query!(
        "INSERT INTO api_keys (auth0_sub, name, key_identifier, hashed_key, active, created_at)
         VALUES ($1, $2, $3, $4, TRUE, $5)",
        user.auth0_sub,
        payload.name,
        &identifier,
        &hashed_key,
        Utc::now().naive_utc()
    )
    .execute(&state.db)
    .await?;

    log::info!(
        "Successfully created API key named '{}' for user '{}'",
        payload.name,
        user.auth0_sub
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
) -> Result<impl IntoResponse, ApiKeyError> {
    log::debug!("Handler: revoke_key called for name: {}", payload.name);

    let execution_result = sqlx::query!(
        "UPDATE api_keys SET active = FALSE, last_used_at = $1 WHERE auth0_sub = $2 AND name = $3 \
         AND active = TRUE",
        Utc::now().naive_utc(),
        user.auth0_sub,
        payload.name
    )
    .execute(&state.db)
    .await;

    match execution_result {
        Ok(result) => {
            if result.rows_affected() == 0 {
                log::warn!(
                    "Attempted to revoke non-existent or inactive key named '{}' for user '{}'",
                    payload.name,
                    user.auth0_sub
                );
                Err(ApiKeyError::NotFound(format!(
                    "Active API key named '{}' not found.",
                    payload.name
                )))
            } else {
                log::info!(
                    "Successfully revoked API key named '{}' for user '{}'",
                    payload.name,
                    user.auth0_sub
                );
                Ok(axum::Json(
                    serde_json::json!({ "message": "API key revoked successfully." }),
                ))
            }
        }
        Err(sqlx_err) => {
            if let sqlx::Error::Database(db_err) = &sqlx_err {
                if db_err.is_unique_violation()
                    && db_err.constraint() == Some("api_keys_user_name_name_active_key_idx")
                {
                    log::error!(
                        "Unexpected unique constraint violation ('{}') during key revocation for \
                         user '{}', name '{}'. This likely indicates a DB schema issue or \
                         inconsistent state. DB Error: {}",
                        db_err.constraint().unwrap_or("unknown"),
                        user.auth0_sub,
                        payload.name,
                        db_err
                    );

                    return Err(ApiKeyError::InternalError(format!(
                        "Unexpected database error while revoking key '{}'. Please contact \
                         support or try again later.",
                        payload.name
                    )));
                }
            }

            log::error!(
                "Database error during key revocation for user '{}', name '{}': {}",
                user.auth0_sub,
                payload.name,
                sqlx_err
            );
            Err(sqlx_err.into())
        }
    }
}

async fn regenerate_key(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<KeyNameRequest>,
) -> Result<impl IntoResponse, ApiKeyError> {
    if payload.name.trim().is_empty() || payload.name.len() > 255 {
        return Err(ApiKeyError::BadRequest(
            "Invalid key name provided.".to_string(),
        ));
    }

    let mut tx: Transaction<Postgres> = state.db.begin().await?;

    let revoke_result = sqlx::query!(
        "
UPDATE api_keys
SET active = FALSE,
    last_used_at = $1
WHERE auth0_sub = $2
    AND name = $3
    AND active = TRUE",
        Utc::now().naive_utc(),
        user.auth0_sub,
        payload.name
    )
    .execute(&mut *tx)
    .await?;

    if revoke_result.rows_affected() == 0 {
        log::warn!(
            "No active key found named '{}' for user '{}' during regeneration. Proceeding to \
             create a new one.",
            payload.name,
            user.auth0_sub
        );
    } else {
        log::debug!(
            "Revoked {} old key(s) named '{}' for user '{}'",
            revoke_result.rows_affected(),
            payload.name,
            user.auth0_sub
        );
    }

    let (new_identifier, new_full_key) = generate_api_key();
    let new_hashed_key = hash_api_key(&new_full_key)?;
    let new_preview = create_key_preview(&new_identifier);

    log::debug!(
        "Generated new identifier: {}, preview: {}",
        new_identifier,
        new_preview
    );

    sqlx::query!(
        "INSERT INTO api_keys (auth0_sub, name, key_identifier, hashed_key, active, created_at)
         VALUES ($1, $2, $3, $4, TRUE, $5)",
        user.auth0_sub,
        payload.name,
        &new_identifier,
        &new_hashed_key,
        Utc::now().naive_utc()
    )
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    log::info!(
        "Successfully regenerated API key named '{}' for user '{}'",
        payload.name,
        user.auth0_sub
    );

    Ok(axum::Json(NewApiKeyResponse {
        name: payload.name.clone(),
        full_key: new_full_key,
        message: "API key regenerated successfully. Store it securely.".to_string(),
    }))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_keys).post(create_key))
        .route("/revoke", post(revoke_key)) // TODO
        .route("/regenerate", post(regenerate_key))
}
