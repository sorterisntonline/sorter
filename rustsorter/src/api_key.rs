use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Transaction, Postgres};
use chrono::{NaiveDateTime, Utc};
use rand::{distributions::Alphanumeric, Rng};
use bcrypt::{hash, verify, DEFAULT_COST};
use anyhow::{Result, Context, anyhow}; // Use anyhow consistently
use axum::{
    extract::{State, Path, Json, Extension}, // Axum extractors
    response::{IntoResponse, Response}, // Axum response types
    routing::{get, post}, // Axum routing methods
    http::StatusCode, // HTTP status codes
    Router, // Axum router
};
use std::fmt;
use tokio; // For spawning the update task

use crate::models::User; // Assuming AppState is in models
use crate::app_state::AppState;

// --- Constants ---
const API_KEY_PREFIX: &str = "sort"; // Prefix without underscore for easier splitting
const IDENTIFIER_LENGTH: usize = 16;
const SECRET_LENGTH: usize = 32;
const KEY_SEPARATOR: char = '_';


// --- Struct Definitions (Adjusted NewApiKeyResponse) ---

#[derive(FromRow, Debug, Clone)] // Added Clone
pub struct ApiKeyDb {
    pub id: i32,
    pub auth0_sub: String,
    pub name: String,
    pub key_identifier: String, // Added field
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

// Renamed 'api_key' to 'full_key' for clarity
#[derive(Serialize, Debug)]
pub struct NewApiKeyResponse {
    pub name: String,
    pub full_key: String, // The plain text key (identifier + secret), ONLY sent on creation/regeneration
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

// --- Error Handling (Copied from previous response, seems okay) ---

#[derive(Debug)]
pub enum ApiKeyError {
    DatabaseError(sqlx::Error),
    HashingError(anyhow::Error), // Changed from bcrypt::BcryptError to anyhow::Error
    VerificationError(bcrypt::BcryptError), // Specific error for verify failure
    Conflict(String),
    NotFound(String),
    Unauthorized,
    BadRequest(String),
    InvalidKeyFormat, // For parsing errors
    InternalError(String), // Generic internal error
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

// Implement Axum's IntoResponse for ApiKeyError
impl IntoResponse for ApiKeyError {
    fn into_response(self) -> Response {
        let (status, error_message) = match &self {
            ApiKeyError::DatabaseError(_) | ApiKeyError::HashingError(_) | ApiKeyError::InternalError(_) | ApiKeyError::VerificationError(_) => {
                 log::error!("Internal API Key Error: {}", self);
                 (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            },
            ApiKeyError::Conflict(msg) => (StatusCode::CONFLICT, msg.clone()),
            ApiKeyError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiKeyError::Unauthorized | ApiKeyError::InvalidKeyFormat => (StatusCode::UNAUTHORIZED, self.to_string()),
            ApiKeyError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
        };
         // Log user-facing errors as warnings
        if status != StatusCode::INTERNAL_SERVER_ERROR { log::warn!("API Key Response: status={}, message='{}'", status, error_message); }
        (status, axum::Json(serde_json::json!({ "error": error_message }))).into_response()
    }
}

// Make sure the constraint name is correct
impl From<sqlx::Error> for ApiKeyError {
    fn from(err: sqlx::Error) -> Self {
        if let sqlx::Error::Database(db_err) = &err {
             if db_err.is_unique_violation() {
                 // Check common unique constraints related to API keys
                 if db_err.constraint() == Some("api_keys_auth0_sub_name_active_key_idx") {
                    return ApiKeyError::Conflict("An active key with this name already exists.".to_string());
                 }
                 if db_err.constraint() == Some("api_keys_key_identifier_key") { // Assuming a UNIQUE constraint on key_identifier
                    log::error!("Duplicate key identifier generated and attempted insert: {}", db_err);
                    return ApiKeyError::InternalError("Failed to generate unique key identifier. Please try again.".to_string());
                 }
             }
        }
        ApiKeyError::DatabaseError(err)
    }
}

impl From<anyhow::Error> for ApiKeyError {
    fn from(err: anyhow::Error) -> Self {
        // Distinguish between hashing and other errors if possible
        ApiKeyError::HashingError(err)
    }
}

impl From<bcrypt::BcryptError> for ApiKeyError {
    fn from(err: bcrypt::BcryptError) -> Self {
        ApiKeyError::VerificationError(err)
    }
}


// --- Key Generation and Utilities ---

// Generates identifier and the full key string (e.g., "sort_identifier_secret")
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

    let full_key = format!("{}{}{}{}{}", API_KEY_PREFIX, KEY_SEPARATOR, identifier, KEY_SEPARATOR, secret);
    (identifier, full_key)
}

// Creates a preview based on the identifier (e.g., "sort_abcd...")
pub fn create_key_preview(identifier: &str) -> String {
     // Ensure identifier isn't too short, though unlikely with length 16
    let preview_len = std::cmp::min(4, identifier.len());
    format!("{}{}{}...", API_KEY_PREFIX, KEY_SEPARATOR, &identifier[..preview_len])
}

// Hashes the API key (full key) using bcrypt
pub fn hash_api_key(full_key: &str) -> Result<String> {
    hash(full_key, DEFAULT_COST).context("Failed to hash API key")
}

// Parses the full key to extract the identifier
fn parse_key_identifier(full_key: &str) -> Result<String, ApiKeyError> {
    if !full_key.starts_with(&format!("{}{}", API_KEY_PREFIX, KEY_SEPARATOR)) {
        return Err(ApiKeyError::InvalidKeyFormat);
    }
    // Example: sort_IDENTIFIER_SECRET
    // Split by '_' -> ["sort", "IDENTIFIER", "SECRET"]
    let parts: Vec<&str> = full_key.splitn(3, KEY_SEPARATOR).collect();
    if parts.len() != 3 || parts[0] != API_KEY_PREFIX || parts[1].len() != IDENTIFIER_LENGTH {
         Err(ApiKeyError::InvalidKeyFormat)
    } else {
        Ok(parts[1].to_string())
    }
}

// --- Database Interaction ---

// Fetches user details by username (moved from find_active_key_by_hash)
pub async fn get_user_by_auth0_sub(pool: &PgPool, auth0_sub: &str) -> Result<User, ApiKeyError> {
    sqlx::query_as!(
        User,
        "SELECT auth0_sub, username, id  FROM users WHERE auth0_sub = $1",
        auth0_sub
    )
    .fetch_one(pool)
    .await
    .map_err(|e| match e {
        sqlx::Error::RowNotFound => ApiKeyError::NotFound(format!("User '{}' not found", auth0_sub)),
        _ => ApiKeyError::DatabaseError(e),
    })
}

// The core verification logic: find by identifier, then verify hash
pub async fn verify_api_key(pool: &PgPool, provided_full_key: &str) -> Result<(ApiKeyDb, User), ApiKeyError> {
    log::debug!("Attempting to verify API key");
    let identifier = parse_key_identifier(provided_full_key)?;
    log::debug!("Parsed identifier: {}", identifier);

    // Find potential key candidate by identifier
    let key_candidate = sqlx::query_as!(
        ApiKeyDb,
        "SELECT id, auth0_sub, name, key_identifier, hashed_key, created_at, last_used_at, active
         FROM api_keys
         WHERE key_identifier = $1 AND active = TRUE",
        &identifier // Use the parsed identifier
    )
    .fetch_optional(pool)
    .await?; // Propagate DB errors via '?' -> From<sqlx::Error> for ApiKeyError

    match key_candidate {
        Some(key) => {
            log::debug!("Found active key record with id: {} for identifier: {}", key.id, identifier);
            // Verify the provided full key against the stored hash
            let is_valid = verify(provided_full_key, &key.hashed_key)
                             .map_err(ApiKeyError::from)?; // Propagate verification errors

            if is_valid {
                log::debug!("API key verification successful for key id: {}", key.id);
                // Key is valid, fetch the associated user
                let user = get_user_by_auth0_sub(pool, &key.auth0_sub).await?;
                log::debug!("Found user: {} associated with key id: {}", user.auth0_sub, key.id);

                // Note: last_used_at update is handled in middleware *after* this returns Ok
                Ok((key, user))
            } else {
                log::warn!("API key verification failed (hash mismatch) for key id: {}", key.id);
                Err(ApiKeyError::Unauthorized) // Or InvalidToken if preferred
            }
        }
        None => {
            log::warn!("No active API key found for identifier: {}", identifier);
            Err(ApiKeyError::Unauthorized) // Or InvalidToken
        }
    }
}

// Function to update last_used_at (called from middleware)
pub async fn update_last_used(pool: &PgPool, key_id: i32) -> Result<()> {
    sqlx::query!(
        "UPDATE api_keys SET last_used_at = $1 WHERE id = $2",
        Utc::now().naive_utc(), // Use NaiveDateTime consistent with schema
        key_id
    )
    .execute(pool)
    .await
    .context("Failed to update last_used_at for API key")?;
    log::debug!("Updated last_used_at for key id: {}", key_id);
    Ok(())
}

// --- API Handlers ---

async fn list_keys(
    State(state): State<AppState>, // Use Axum's State extractor
    Extension(user): Extension<User>, // Use Axum's Extension extractor (populated by middleware)
) -> Result<impl IntoResponse, ApiKeyError> {
    log::debug!("Handler: list_keys called");
    // user is extracted directly via Extension
    log::debug!("Authenticated user for list_keys: {}", user.auth0_sub);

    let keys = sqlx::query_as!(
        ApiKeyDb,
        "SELECT id, auth0_sub, name, key_identifier, hashed_key, created_at, last_used_at, active
         FROM api_keys
         WHERE auth0_sub = $1 ORDER BY created_at DESC",
        user.auth0_sub
    )
    .fetch_all(&state.db)
    .await?; // Propagates DB errors

    let response_keys: Vec<ApiKeyResponse> = keys.into_iter().map(ApiKeyResponse::from).collect();
    log::debug!("Found {} keys for user {}", response_keys.len(), user.auth0_sub);

    Ok((StatusCode::OK, axum::Json(serde_json::json!({ "api_keys": response_keys }))))
}

async fn create_key(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<CreateKeyRequest>, // Axum
) -> Result<impl IntoResponse, ApiKeyError> {
    log::debug!("Handler: create_key called for name: {}", payload.name);
    // user is extracted directly via Extension
     log::debug!("Authenticated user for create_key: {}", user.auth0_sub);

    if payload.name.trim().is_empty() || payload.name.len() > 255 {
         return Err(ApiKeyError::BadRequest("Invalid key name provided.".to_string()));
    }

    // Generate identifier and full key
    let (identifier, full_key) = generate_api_key();
    let hashed_key = hash_api_key(&full_key)?; // Hash the full key
    let preview = create_key_preview(&identifier); // Preview based on identifier

    log::debug!("Generated identifier: {}, preview: {}", identifier, preview);

    // Insert including the identifier
    sqlx::query!(
        "INSERT INTO api_keys (auth0_sub, name, key_identifier, hashed_key, active, created_at)
         VALUES ($1, $2, $3, $4, TRUE, $5)",
        user.auth0_sub,
        payload.name,
        &identifier, // Store the identifier
        &hashed_key,
        Utc::now().naive_utc() // Explicitly set created_at
    )
    .execute(&state.db)
    .await?; // Let the From<sqlx::Error> handle unique constraint violations

    log::info!("Successfully created API key named '{}' for user '{}'", payload.name, user.auth0_sub);
    // Return the *plain text* full key THIS ONE TIME
    Ok((StatusCode::CREATED, axum::Json(NewApiKeyResponse {
        name: payload.name.clone(),
        full_key, // Return the full key
        message: "API key created successfully. Store it securely, it will not be shown again.".to_string(),
    })))
}
async fn revoke_key(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<KeyNameRequest>, // Axum
) -> Result<impl IntoResponse, ApiKeyError> {
    log::debug!("Handler: revoke_key called for name: {}", payload.name);

    // Explicitly handle the result here instead of just using '?' to diagnose the unexpected constraint violation
    let execution_result = sqlx::query!(
        "UPDATE api_keys SET active = FALSE, last_used_at = $1 WHERE auth0_sub = $2 AND name = $3 AND active = TRUE",
        Utc::now().naive_utc(), // Set last_used on revoke as well
        user.auth0_sub,
        payload.name
    )
    .execute(&state.db)
    .await; // Remove '?' to handle the result manually below

    // Check the result of the execution
    match execution_result {
        Ok(result) => {
            // If the update succeeded, check if any rows were affected
            if result.rows_affected() == 0 {
                 log::warn!("Attempted to revoke non-existent or inactive key named '{}' for user '{}'", payload.name, user.auth0_sub);
                 Err(ApiKeyError::NotFound(format!("Active API key named '{}' not found.", payload.name)))
            } else {
                log::info!("Successfully revoked API key named '{}' for user '{}'", payload.name, user.auth0_sub);
                Ok(axum::Json(serde_json::json!({ "message": "API key revoked successfully." })))
            }
        }
        Err(sqlx_err) => {
             // Explicitly check if the error is the specific unique constraint violation
             if let sqlx::Error::Database(db_err) = &sqlx_err {
                 if db_err.is_unique_violation() && db_err.constraint() == Some("api_keys_user_name_name_active_key_idx") {
                     // This specific error is unexpected during revoke. Log detailed info and return 500.
                     log::error!(
                         "Unexpected unique constraint violation ('{}') during key revocation for user '{}', name '{}'. This likely indicates a DB schema issue or inconsistent state. DB Error: {}",
                         db_err.constraint().unwrap_or("unknown"),
                         user.auth0_sub,
                         payload.name,
                         db_err
                     );
                     // Return 500 Internal Server Error instead of the misleading 409 Conflict
                     return Err(ApiKeyError::InternalError(format!(
                         "Unexpected database error while revoking key '{}'. Please contact support or try again later.",
                         payload.name
                     )));
                 }
             }
             // For any other database errors, use the existing From<sqlx::Error> conversion
             log::error!("Database error during key revocation for user '{}', name '{}': {}", user.auth0_sub, payload.name, sqlx_err);
             Err(sqlx_err.into()) // Convert using the From trait
        }
    }
}

async fn regenerate_key(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Json(payload): Json<KeyNameRequest>, // Axum
) -> Result<impl IntoResponse, ApiKeyError> {

    if payload.name.trim().is_empty() || payload.name.len() > 255 {
         return Err(ApiKeyError::BadRequest("Invalid key name provided.".to_string()));
    }

    // Use a transaction
    let mut tx: Transaction<Postgres> = state.db.begin().await?;

    // 1. Revoke the old key(s) with the same name
    let revoke_result = sqlx::query!(
        "UPDATE api_keys SET active = FALSE, last_used_at = $1 WHERE auth0_sub = $2 AND name = $3 AND active = TRUE",
        Utc::now().naive_utc(),
        user.auth0_sub,
        payload.name
    )
    .execute(&mut *tx) // Use mutable reference for transaction
    .await?;

    if revoke_result.rows_affected() == 0 {
        log::warn!("No active key found named '{}' for user '{}' during regeneration. Proceeding to create a new one.", payload.name, user.auth0_sub);
    } else {
        log::debug!("Revoked {} old key(s) named '{}' for user '{}'", revoke_result.rows_affected(), payload.name, user.auth0_sub);
    }

    // 2. Generate and insert the new key
    let (new_identifier, new_full_key) = generate_api_key();
    let new_hashed_key = hash_api_key(&new_full_key)?;
    let new_preview = create_key_preview(&new_identifier);

     log::debug!("Generated new identifier: {}, preview: {}", new_identifier, new_preview);

    sqlx::query!(
        "INSERT INTO api_keys (auth0_sub, name, key_identifier, hashed_key, active, created_at)
         VALUES ($1, $2, $3, $4, TRUE, $5)",
        user.auth0_sub,
        payload.name,
        &new_identifier, // Store the new identifier
        &new_hashed_key,
        Utc::now().naive_utc()
    )
    .execute(&mut *tx)
    .await?; // Propagate DB errors

    // Commit transaction
    tx.commit().await?;

    log::info!("Successfully regenerated API key named '{}' for user '{}'", payload.name, user.auth0_sub);
    // Return the *plain text* key THIS ONE TIME
    Ok(axum::Json(NewApiKeyResponse {
        name: payload.name.clone(),
        full_key: new_full_key, // Return the new full key
        message: "API key regenerated successfully. Store it securely.".to_string(),
    }))
}

// --- Service Configuration ---

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_keys).post(create_key))
        .route("/revoke", post(revoke_key)) // TODO
        .route("/regenerate", post(regenerate_key))
}