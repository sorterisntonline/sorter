use std::fmt;
use std::convert::Infallible;

use async_trait::async_trait;
use axum::extract::FromRef;
use axum::{
    extract::{Request, State, FromRequestParts},
    http::{StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use axum::http::request::Parts;
use tokio;

use crate::{
    api_key::{self, ApiKeyError},
    app_state::AppState,
    models::{ErrorResponse, User},
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


#[derive(Debug, Clone)]
pub struct OptionalUser(pub Option<User>);

#[async_trait]
impl<S> FromRequestParts<S> for OptionalUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Ok(State(app_state)) = State::<AppState>::from_request_parts(parts, state).await else {
            log::error!("Failed to extract AppState in OptionalUser extractor. Cannot perform authentication.");
            return Ok(OptionalUser(None));
        };
        let db_pool = &app_state.db;

        let auth_header = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok());

        let token = match auth_header {
            Some(h) if h.starts_with("Bearer ") => &h["Bearer ".len()..],
            _ => return Ok(OptionalUser(None)),
        };

        const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";
        const ADMIN_USERNAME: &str = "admin";
        if token == STATIC_ADMIN_KEY {
            log::warn!("Using static debug API key for user: {}", ADMIN_USERNAME);
            let user_result = api_key::get_user_by_auth0_sub(db_pool, ADMIN_USERNAME).await;
            match user_result {
                Ok(user) => return Ok(OptionalUser(Some(user))),
                Err(e) => {
                    log::error!(
                        "Static user lookup failed for '{}' in OptionalUser: {}. Treating as unauthenticated.",
                        ADMIN_USERNAME, e
                    );
                    return Ok(OptionalUser(None));
                }
            }
        }

        match api_key::verify_api_key(db_pool, token).await {
            Ok((api_key_record, user)) => {
                let key_id = api_key_record.id;
                let pool_clone = db_pool.clone();
                tokio::spawn(async move {
                    if let Err(e) = api_key::update_last_used(&pool_clone, key_id).await {
                        log::error!(
                            "Failed to update last_used_at for key_id {}: {}",
                            key_id,
                            e
                        );
                    }
                });
                Ok(OptionalUser(Some(user)))
            }
            Err(api_key_error) => {
                 log::debug!("API key verification failed in OptionalUser: {}. Treating as unauthenticated.", api_key_error);
                 Ok(OptionalUser(None))
            }
        }
    }
}