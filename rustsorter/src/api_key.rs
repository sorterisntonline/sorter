// src/models.rs
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::NaiveDateTime;
use rand::{distributions::Alphanumeric, Rng};
use bcrypt::{hash, DEFAULT_COST};
use anyhow::{Result, Context};

#[derive(Serialize, FromRow, Debug, Clone)]
pub struct User {
    pub user_name: String,
    pub email: Option<String>,
    pub email_verified: Option<bool>, // Made optional for simplicity if not always needed
}

// Represents the data stored in the DB
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

// Note: Verification happens by hashing the input and comparing to the stored hash.
// bcrypt::verify(provided_key, stored_hash) is NOT used here because
// src/db_utils.rs
use sqlx::PgPool;

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
        None => Err(anyhow::anyhow!("API key not found or not active")),
    }
}