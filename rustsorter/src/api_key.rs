// src/models.rs
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::NaiveDateTime;
use rand::{distributions::Alphanumeric, Rng};
use bcrypt::{hash, DEFAULT_COST};
use anyhow::{Result, Context};
use sqlx::PgPool;
use crate::models::User;
#[derive(FromRow, Debug)]
pub struct ApiKeyDb {
    pub id: i32,
    pub user_name: String,
    pub name: String,
    pub hashed_key: String,
    pub preview: Option<String>,
    pub created_at: NaiveDateTime,
    pub last_used_at: Option<NaiveDateTime>,
    pub active: bool,
}

// Represents what we show to the user (excluding the hashed key)
#[derive(Serialize, Debug)]
pub struct ApiKeyResponse {
    pub id: i32,
    pub user_name: String,
    pub name: String,
    pub preview: Option<String>,
    pub created_at: NaiveDateTime,
    pub last_used_at: Option<NaiveDateTime>,
    pub active: bool,
}

impl From<ApiKeyDb> for ApiKeyResponse {
    fn from(db_key: ApiKeyDb) -> Self {
        ApiKeyResponse {
            id: db_key.id,
            user_name: db_key.user_name,
            name: db_key.name,
            preview: db_key.preview,
            created_at: db_key.created_at,
            last_used_at: db_key.last_used_at,
            active: db_key.active,
        }
    }
}

// Represents the response when a *new* key is created (includes plain text key)
#[derive(Serialize, Debug)]
pub struct NewApiKeyResponse {
    pub name: String,
    pub api_key: String, // The plain text key, ONLY sent on creation
    pub preview: String,
    pub message: String,
}

// Request body for creating a key
#[derive(Deserialize, Debug)]
pub struct CreateKeyRequest {
    pub name: String,
}

// Request body for revoking/regenerating
#[derive(Deserialize, Debug)]
pub struct KeyNameRequest {
    pub name: String,
}
// src/key_utils.rs

const API_KEY_PREFIX: &str = "sort_";
const API_KEY_LENGTH: usize = 32; // Length of the random part

// Generates a new API key string (e.g., "sort_xxxxx...")
pub fn generate_api_key() -> String {
    let random_part: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(API_KEY_LENGTH)
        .map(char::from)
        .collect();
    format!("{}{}", API_KEY_PREFIX, random_part)
}

// Creates a preview of the key (e.g., "sort_abc...")
pub fn create_key_preview(api_key: &str) -> String {
    format!("{}{}...", API_KEY_PREFIX, &api_key[API_KEY_PREFIX.len()..].chars().take(4).collect::<String>())
}

// Hashes the API key using bcrypt
pub fn hash_api_key(api_key: &str) -> Result<String> {
    hash(api_key, DEFAULT_COST).context("Failed to hash API key")
}


// Fetches user details by username
pub async fn get_user_by_username(pool: &PgPool, username: &str) -> Result<User> {
    sqlx::query_as!(
        User,
        "SELECT user_name, email, email_verified FROM users WHERE user_name = $1",
        username
    )
    .fetch_one(pool)
    .await
    .context("Failed to fetch user by username")
}

// Finds an active API key by its hash and updates last_used_at
pub async fn find_active_key_by_hash(pool: &PgPool, hashed_key: &str) -> Result<ApiKeyDb> {
    // Use a transaction to ensure atomicity of find and update
    let mut tx = pool.begin().await.context("Failed to begin transaction")?;

    let key = sqlx::query_as!(
        ApiKeyDb,
        "SELECT * FROM api_keys WHERE hashed_key = $1 AND active = TRUE",
        hashed_key
    )
    .fetch_optional(&mut *tx) // Use transaction
    .await
    .context("Failed to query API key by hash")?;

    match key {
        Some(k) => {
            // Update last_used_at
            sqlx::query!(
                "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
                k.id
            )
            .execute(&mut *tx) // Use transaction
            .await
            .context("Failed to update last_used_at for API key")?;

            tx.commit().await.context("Failed to commit transaction")?;
            Ok(k)
        }
        None => {
            tx.rollback().await.context("Failed to rollback transaction")?;
            Err(anyhow::anyhow!("API key not found or not active"))
        }
    }
}

use actix_web::{web, get, post, HttpResponse, HttpMessage, ResponseError};
use std::fmt;

// Define a specific error type for API key operations
#[derive(Debug)]
pub enum ApiKeyError {
    DatabaseError(sqlx::Error),
    HashingError(anyhow::Error),
    Conflict(String),
    NotFound(String),
    Unauthorized,
    BadRequest(String),
}

impl fmt::Display for ApiKeyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiKeyError::DatabaseError(e) => write!(f, "Database error: {}", e),
            ApiKeyError::HashingError(e) => write!(f, "Hashing error: {}", e),
            ApiKeyError::Conflict(msg) => write!(f, "Conflict: {}", msg),
            ApiKeyError::NotFound(msg) => write!(f, "Not Found: {}", msg),
            ApiKeyError::Unauthorized => write!(f, "Unauthorized"),
            ApiKeyError::BadRequest(msg) => write!(f, "Bad Request: {}", msg),
        }
    }
}

impl ResponseError for ApiKeyError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        match self {
            ApiKeyError::DatabaseError(_) | ApiKeyError::HashingError(_) => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
            ApiKeyError::Conflict(_) => actix_web::http::StatusCode::CONFLICT,
            ApiKeyError::NotFound(_) => actix_web::http::StatusCode::NOT_FOUND,
            ApiKeyError::Unauthorized => actix_web::http::StatusCode::UNAUTHORIZED,
            ApiKeyError::BadRequest(_) => actix_web::http::StatusCode::BAD_REQUEST,
        }
    }

     fn error_response(&self) -> HttpResponse {
        log::error!("API Key Error: {}", self); // Log the error
        HttpResponse::build(self.status_code())
            .json(serde_json::json!({ "error": self.to_string() }))
    }
}

impl From<sqlx::Error> for ApiKeyError {
    fn from(err: sqlx::Error) -> Self {
        // Check for unique violation specifically for name conflict
        if let sqlx::Error::Database(db_err) = &err {
             if db_err.is_unique_violation() && db_err.constraint() == Some("api_keys_user_name_name_active_key") {
                // TODO @chris: test if this error shows up
                return ApiKeyError::Conflict("An active key with this name already exists.".to_string());
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


// --- Handlers ---

// GET /api/keys - List keys for the authenticated user
#[get("")]
async fn list_keys(
    req: actix_web::HttpRequest,
    data: web::Data<crate::models::AppState>,
) -> Result<HttpResponse, ApiKeyError> {
    log::info!("Received request to list API keys");
    // Extract user from request extensions (inserted by middleware)
    let user = req.extensions().get::<User>().cloned().ok_or(ApiKeyError::Unauthorized)?;

    let keys = sqlx::query_as!(
        crate::api_key::ApiKeyDb, // Specify the type explicitly
        "SELECT * FROM api_keys WHERE user_name = $1 ORDER BY created_at DESC",
        user.user_name
    )
    .fetch_all(&data.db)
    .await?;

    let response_keys: Vec<ApiKeyResponse> = keys.into_iter().map(ApiKeyResponse::from).collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({ "api_keys": response_keys })))
}

// POST /api/keys - Create a new API key
#[post("")]
async fn create_key(
    req: actix_web::HttpRequest,
    data: web::Data<crate::models::AppState>,
    payload: web::Json<CreateKeyRequest>,
) -> Result<HttpResponse, ApiKeyError> {
    let user = req.extensions().get::<User>().cloned().ok_or(ApiKeyError::Unauthorized)?;

    if payload.name.trim().is_empty() || payload.name.len() > 255 {
         return Err(ApiKeyError::BadRequest("Invalid key name provided.".to_string()));
    }

    let api_key = generate_api_key();
    let hashed_key = hash_api_key(&api_key)?;
    let preview = create_key_preview(&api_key);

    // Use explicit query! macro to handle potential UNIQUE constraint violation
    let result = sqlx::query!(
        "INSERT INTO api_keys (user_name, name, hashed_key, preview, active) VALUES ($1, $2, $3, $4, TRUE)",
        user.user_name,
        payload.name,
        hashed_key,
        preview
    )
    .execute(&data.db)
    .await;

     match result {
        Ok(_) => {
            // Return the *plain text* key THIS ONE TIME
            Ok(HttpResponse::Created().json(NewApiKeyResponse {
                name: payload.name.clone(),
                api_key, // The plain text key
                preview,
                message: "API key created successfully. Store it securely, it will not be shown again.".to_string(),
            }))
        }
        Err(e) => {
            // Handle specific unique constraint error or return generic DB error
            if let sqlx::Error::Database(db_err) = &e {
                if db_err.is_unique_violation() && db_err.constraint() == Some("api_keys_user_name_name_active_key") {
                    return Err(ApiKeyError::Conflict(format!("An active API key named '{}' already exists.", payload.name)));
                }
            }
            Err(ApiKeyError::DatabaseError(e))
        }
    }
}

// POST /api/keys/revoke - Revoke an API key
#[post("/revoke")]
async fn revoke_key(
    req: actix_web::HttpRequest,
    data: web::Data<crate::models::AppState>,
    payload: web::Json<KeyNameRequest>,
) -> Result<HttpResponse, ApiKeyError> {
    let user = req.extensions().get::<User>().cloned().ok_or(ApiKeyError::Unauthorized)?;

    let result = sqlx::query!(
        "UPDATE api_keys SET active = FALSE, last_used_at = NOW() WHERE user_name = $1 AND name = $2 AND active = TRUE",
        user.user_name,
        payload.name
    )
    .execute(&data.db)
    .await?;

    if result.rows_affected() == 0 {
         Err(ApiKeyError::NotFound(format!("Active API key named '{}' not found.", payload.name)))
    } else {
        Ok(HttpResponse::Ok().json(serde_json::json!({ "message": "API key revoked successfully." })))
    }
}

// POST /api/keys/regenerate - Regenerate an API key (create new, revoke old)
#[post("/regenerate")]
async fn regenerate_key(
    req: actix_web::HttpRequest,
    data: web::Data<crate::models::AppState>,
    payload: web::Json<KeyNameRequest>,
) -> Result<HttpResponse, ApiKeyError> {
     let user = req.extensions().get::<User>().cloned().ok_or(ApiKeyError::Unauthorized)?;

    // Use a transaction
    let mut tx = data.db.begin().await?;

    // 1. Revoke the old key(s) with the same name
    let revoke_result = sqlx::query!(
        "UPDATE api_keys SET active = FALSE, last_used_at = NOW() WHERE user_name = $1 AND name = $2 AND active = TRUE",
        user.user_name,
        payload.name
    )
    .execute(&mut *tx)
    .await?;

    if revoke_result.rows_affected() == 0 {
        // If no active key was found to revoke, we might still allow creating it,
        // or return an error depending on desired behavior. Let's allow creation.
         log::warn!("No active key found named '{}' for user '{}' during regeneration. Creating a new one.", payload.name, user.user_name);
         // Optionally, you could return Err(ApiKeyError::NotFound(...)) here if regeneration strictly requires an existing key.
    }

    // 2. Generate and insert the new key
    let new_api_key = generate_api_key();
    let new_hashed_key = hash_api_key(&new_api_key)?;
    let new_preview = create_key_preview(&new_api_key);

    sqlx::query!(
        "INSERT INTO api_keys (user_name, name, hashed_key, preview, active) VALUES ($1, $2, $3, $4, TRUE)",
        user.user_name,
        payload.name,
        new_hashed_key,
        new_preview
    )
    .execute(&mut *tx)
    .await?; // Propagate DB errors

    // Commit transaction
    tx.commit().await?;

     // Return the *plain text* key THIS ONE TIME
    Ok(HttpResponse::Ok().json(NewApiKeyResponse {
        name: payload.name.clone(),
        api_key: new_api_key,
        preview: new_preview,
        message: "API key regenerated successfully. Store it securely.".to_string(),
    }))
}

// Helper function to configure the service scope
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(list_keys)
       .service(create_key)
       .service(revoke_key)
       .service(regenerate_key);
}