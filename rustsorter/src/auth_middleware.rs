// src/auth_middleware.rs
use crate::{
    models::AppState,
    api_key::{find_active_key_by_hash, get_user_by_username, hash_api_key},
};
use crate::models::User;
use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    web, Error, HttpMessage, HttpResponse, ResponseError
};
use futures_util::future::{self, LocalBoxFuture, Ready};
use std::rc::Rc;
use std::fmt;

// Define a custom error type
#[derive(Debug)]
pub enum AuthError {
    NoCredentials,
    InvalidHeader,
    InvalidToken,
    InternalError(anyhow::Error),
}

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AuthError::NoCredentials => write!(f, "No authentication credentials provided"),
            AuthError::InvalidHeader => write!(f, "Invalid Authorization header format"),
            AuthError::InvalidToken => write!(f, "Invalid or expired API key"),
            AuthError::InternalError(e) => write!(f, "Internal server error: {}", e),
        }
    }
}

impl ResponseError for AuthError {
    fn error_response(&self) -> HttpResponse {
        match self {
            AuthError::NoCredentials | AuthError::InvalidHeader | AuthError::InvalidToken => {
                HttpResponse::Unauthorized().json(serde_json::json!({ "error": self.to_string() }))
            }
            AuthError::InternalError(_) => {
                // Log the internal error for debugging
                log::error!("Authentication internal error: {}", self);
                HttpResponse::InternalServerError().json(serde_json::json!({ "error": "An internal error occurred during authentication" }))
            }
        }
    }
}

// The middleware struct
pub struct ApiKeyAuth;

impl<S: 'static, B> Transform<S, ServiceRequest> for ApiKeyAuth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = ApiKeyAuthMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        future::ready(Ok(ApiKeyAuthMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct ApiKeyAuthMiddleware<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for ApiKeyAuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        let app_state = req.app_data::<web::Data<AppState>>().cloned(); // Clone the Data<AppState>

        Box::pin(async move {
            let app_state = match app_state {
                 Some(state) => state,
                 None => {
                     log::error!("AppState not found in request");
                     let err = AuthError::InternalError(anyhow::anyhow!("AppState configuration error"));
                     return Err(err.into()); // Convert AuthError to actix_web::Error
                 }
             };

            let auth_header = req.headers().get("Authorization");

            let user_result = match auth_header {
                Some(header_value) => {
                    match header_value.to_str() {
                        Ok(header_str) => {
                            if !header_str.starts_with("Bearer ") {
                                Err(AuthError::InvalidHeader)
                            } else {
                                let token = &header_str["Bearer ".len()..];
                                authenticate_token(token, &app_state.db).await
                            }
                        },
                        Err(_) => Err(AuthError::InvalidHeader),
                    }
                },
                None => Err(AuthError::NoCredentials),
            };

            match user_result {
                Ok(user) => {
                    // Insert user into request extensions
                    req.extensions_mut().insert(user);
                    // Call the next service
                    service.call(req).await
                }
                Err(auth_error) => {
                    // Authentication failed, return error response
                    log::debug!("API Key Authentication failed: {}", auth_error);
                    Err(auth_error.into()) // Convert AuthError to actix_web::Error
                }
            }
        })
    }
}

// Helper function for authentication logic
async fn authenticate_token(token: &str, db_pool: &sqlx::PgPool) -> Result<User, AuthError> {

    // --- START DEV/TEST ONLY STATIC KEY ---
    const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";
    const ADMIN_USERNAME: &str = "admin"; // As per your run-postgres.sh upsert

    log::info!("Authenticating token: {}", token);
    if token == STATIC_ADMIN_KEY {
        log::error!("Using static debug API key for user: {}", ADMIN_USERNAME);
        return get_user_by_username(db_pool, ADMIN_USERNAME)
            .await
            .map_err(|e| AuthError::InternalError(e.context("Failed to fetch static key user")));
    }
    // --- END DEV/TEST ONLY STATIC KEY ---

    // Normal key authentication
    let hashed_token_result = hash_api_key(token);
    let hashed_token = match hashed_token_result {
        Ok(h) => h,
        Err(e) => return Err(AuthError::InternalError(e)),
    };

    match find_active_key_by_hash(db_pool, &hashed_token).await {
        Ok(api_key_db) => {
            // Found the key, now get the user
            get_user_by_username(db_pool, &api_key_db.user_name)
                .await
                .map_err(|e| AuthError::InternalError(e.context("Failed to fetch user for API key")))
        }
        Err(e) => {
            // Log the underlying error only if it's not just "not found"
            if e.to_string().contains("API key not found") {
                 Err(AuthError::InvalidToken)
            } else {
                Err(AuthError::InternalError(e.context("Database error during key lookup")))
            }
        }
    }
}