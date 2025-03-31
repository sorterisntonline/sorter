use crate::{
    models::User, // Assuming AppState is in models
    api_key::{self, ApiKeyDb, ApiKeyError}, // Import necessary items from api_key module
};
use crate::app_state::AppState;
use std::fmt;
use tokio; // For spawning background task
use axum::{
    extract::{Request, State}, // Use Axum's Request and State extractors
    middleware::{self, Next}, // Use Axum's middleware utilities
    response::{IntoResponse, Response}, // Use Axum's response types
    http::{header, StatusCode}, // Use Axum's http types
};

// Custom AuthError type
#[derive(Debug)]
pub enum AuthError {
    NoCredentials,
    InvalidHeader,
    ApiKeyVerificationFailed(ApiKeyError), // Wrap ApiKeyError
    InternalError(anyhow::Error),
    // Removed InvalidToken as it's covered by ApiKeyVerificationFailed
}

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuthError::NoCredentials => write!(f, "No authentication credentials provided"),
            AuthError::InvalidHeader => write!(f, "Invalid Authorization header format"),
            // Display the underlying ApiKeyError message for more context
            AuthError::ApiKeyVerificationFailed(e) => write!(f, "API key verification failed: {}", e),
            AuthError::InternalError(e) => write!(f, "Internal server error: {}", e),
        }
    }
}

// Map AuthError to HTTP responses
impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        match self {
            AuthError::NoCredentials | AuthError::InvalidHeader => {
                (StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({ "error": self.to_string() }))).into_response()
            }
            // Use the status code from the wrapped ApiKeyError if possible
            AuthError::ApiKeyVerificationFailed(api_key_err) => {
                 log::warn!("API Key Auth Failed: {}", api_key_err);
                 api_key_err.into_response() // Delegate to ApiKeyError's IntoResponse impl
            }
            AuthError::InternalError(_) => {
                log::error!("Authentication internal error: {}", self);
                (StatusCode::INTERNAL_SERVER_ERROR, axum::Json(serde_json::json!({ "error": "An internal error occurred during authentication" }))).into_response()
            }
        }
    }
}

// --- Axum Middleware Function ---

pub async fn auth(
    State(app_state): State<AppState>, // State is now the first argument
    mut request: Request, // Request becomes the second argument
    next: Next, // Next becomes the third argument
) -> Result<Response, AuthError> { // Return Result<Response, AuthError>
    let db_pool = app_state.db; // Use the passed state directly

    // --- Extract Token ---
    let auth_header = request.headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => &header["Bearer ".len()..],
        _ => return Err(AuthError::NoCredentials), // Or InvalidHeader depending on checks
    };

    // --- Static Key Check (Example) ---
    const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";
    const ADMIN_USERNAME: &str = "admin";

    if token == STATIC_ADMIN_KEY {
        log::warn!("Using static debug API key for user: {}", ADMIN_USERNAME);
        return match api_key::get_user_by_username(&db_pool, ADMIN_USERNAME).await {
            Ok(user) => {
                request.extensions_mut().insert(user); // Insert user into request extensions
                Ok(next.run(request).await) // Call the next layer
            }
            Err(e) => {
                log::error!("Failed to fetch static key user '{}': {}", ADMIN_USERNAME, e);
                Err(AuthError::InternalError(anyhow::anyhow!("Static user lookup failed")))
            }
        };
    }
    // --- End Static Key Check ---


    // --- Normal API Key Verification ---
    match api_key::verify_api_key(&db_pool, token).await {
        Ok((api_key_record, user)) => {
            log::debug!("Authentication successful for user: {}", user.user_name);
            let key_id = api_key_record.id;

            // Insert user data into request extensions for handlers to use
            request.extensions_mut().insert(user);

            // Spawn background task to update last_used_at
            let pool_clone = db_pool.clone();
            tokio::spawn(async move {
                if let Err(e) = api_key::update_last_used(&pool_clone, key_id).await {
                    log::error!("Failed to update last_used_at for key_id {}: {}", key_id, e);
                }
            });

            // Call the next service in the middleware chain or the final handler
            Ok(next.run(request).await)
        }
        Err(api_key_error) => {
            Err(AuthError::ApiKeyVerificationFailed(api_key_error)) // Map error
        }
    }
}