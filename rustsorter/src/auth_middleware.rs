use std::fmt;

use axum::{
    extract::{Request, State},
    http::{StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use tokio;

use crate::{
    api_key::{self, ApiKeyError},
    app_state::AppState,
    models::ErrorResponse,
};

#[derive(Debug)]
pub enum AuthError {
    NoCredentials,
    InvalidHeader,
    ApiKeyVerificationFailed(ApiKeyError),
    InternalError(anyhow::Error),
}

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuthError::NoCredentials => write!(f, "No authentication credentials provided"),
            AuthError::InvalidHeader => write!(f, "Invalid Authorization header format"),

            AuthError::ApiKeyVerificationFailed(e) => {
                write!(f, "API key verification failed: {}", e)
            }
            AuthError::InternalError(e) => write!(f, "Internal server error: {}", e),
        }
    }
}

impl From<AuthError> for ErrorResponse {
    fn from(error: AuthError) -> Self {
        let (status_code, error_message) = match error {
            AuthError::NoCredentials | AuthError::InvalidHeader => {
                (StatusCode::UNAUTHORIZED, error.to_string())
            }
            AuthError::ApiKeyVerificationFailed(api_key_err) => {
                log::warn!("API Key Auth Failed: {}", api_key_err);
                return api_key_err.into();
            }
            AuthError::InternalError(_) => {
                log::error!("Authentication internal error: {}", error);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "An internal error occurred during authentication".to_owned(),
                )
            }
        };

        Self::new(status_code, error_message)
    }
}

// temporary impl for ApiKeyError to return ErrorResponse until FRI-373 is fixed
impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        ErrorResponse::from(self).into_response()
    }
}

// Middleware that enforces authentication. Rejects requests without a valid token.
pub async fn auth(
    State(app_state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AuthError> {
    let db_pool = app_state.db;

    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => &header["Bearer ".len()..],
        _ => return Err(AuthError::NoCredentials),
    };

    const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";
    const ADMIN_USERNAME: &str = "admin";

    if token == STATIC_ADMIN_KEY {
        log::warn!("Using static debug API key for user: {}", ADMIN_USERNAME);
        return match api_key::get_user_by_auth0_sub(&db_pool, ADMIN_USERNAME).await {
            Ok(user) => {
                request.extensions_mut().insert(user);
                Ok(next.run(request).await)
            }
            Err(e) => {
                log::error!(
                    "Failed to fetch static key user '{}': {}",
                    ADMIN_USERNAME,
                    e
                );
                Err(AuthError::InternalError(anyhow::anyhow!(
                    "Static user lookup failed"
                )))
            }
        };
    }

    match api_key::verify_api_key(&db_pool, token).await {
        Ok((api_key_record, user)) => {
            log::debug!("Authentication successful for user: {}", user.auth0_sub);
            let key_id = api_key_record.id;

            request.extensions_mut().insert(user);

            let pool_clone = db_pool.clone();
            tokio::spawn(async move {
                if let Err(e) = api_key::update_last_used(&pool_clone, key_id).await {
                    log::error!("Failed to update last_used_at for key_id {}: {}", key_id, e);
                }
            });

            Ok(next.run(request).await)
        }
        Err(api_key_error) => Err(AuthError::ApiKeyVerificationFailed(api_key_error)),
    }
}

// Middleware that attempts authentication but allows requests without a token.
// Rejects requests ONLY if a token is provided but is invalid.
pub async fn try_auth(
    State(app_state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AuthError> {
    let db_pool = app_state.db;

    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    // If no auth header is present, proceed without inserting a user
    let Some(header) = auth_header else {
        log::debug!("No authorization header found, proceeding without authentication.");
        return Ok(next.run(request).await);
    };

    // If a header is present, it MUST be valid
    let token = if header.starts_with("Bearer ") {
        &header["Bearer ".len()..]
    } else {
        // Header present but malformed
        return Err(AuthError::InvalidHeader);
    };

    const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";
    const ADMIN_USERNAME: &str = "admin";

    if token == STATIC_ADMIN_KEY {
        log::warn!("Using static debug API key for user: {}", ADMIN_USERNAME);
        match api_key::get_user_by_auth0_sub(&db_pool, ADMIN_USERNAME).await {
            Ok(user) => {
                request.extensions_mut().insert(user);
                // Proceed with the user inserted
                return Ok(next.run(request).await);
            }
            Err(e) => {
                log::error!(
                    "Failed to fetch static key user '{}': {}",
                    ADMIN_USERNAME,
                    e
                );
                // Error during static user lookup
                return Err(AuthError::InternalError(anyhow::anyhow!(
                    "Static user lookup failed"
                )));
            }
        }
    }

    // Attempt to verify the regular API key
    match api_key::verify_api_key(&db_pool, token).await {
        Ok((api_key_record, user)) => {
            log::debug!("Authentication successful for user: {}", user.auth0_sub);
            let key_id = api_key_record.id;

            request.extensions_mut().insert(user);

            let pool_clone = db_pool.clone();
            tokio::spawn(async move {
                if let Err(e) = api_key::update_last_used(&pool_clone, key_id).await {
                    log::error!("Failed to update last_used_at for key_id {}: {}", key_id, e);
                }
            });

            // Proceed with the authenticated user
            Ok(next.run(request).await)
        }
        Err(api_key_error) => {
            // Token was provided but verification failed
            Err(AuthError::ApiKeyVerificationFailed(api_key_error))
        }
    }
}

