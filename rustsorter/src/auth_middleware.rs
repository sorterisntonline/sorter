use crate::{
    api_key::{self, ApiKeyError}, // Import necessary items from api_key module
};
use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    web, Error as ActixError, HttpMessage, HttpResponse, ResponseError
};
use futures_util::future::{self, LocalBoxFuture, Ready};
use std::rc::Rc;
use std::fmt;
use tokio; // For spawning background task

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
impl ResponseError for AuthError {
    fn error_response(&self) -> HttpResponse {
        match self {
            AuthError::NoCredentials | AuthError::InvalidHeader => {
                HttpResponse::Unauthorized().json(serde_json::json!({ "error": self.to_string() }))
            }
            // Use the status code from the wrapped ApiKeyError if possible
            AuthError::ApiKeyVerificationFailed(api_key_err) => {
                 log::warn!("API Key Auth Failed: {}", api_key_err);
                 api_key_err.error_response() // Delegate to ApiKeyError's response handling
            }
            AuthError::InternalError(_) => {
                log::error!("Authentication internal error: {}", self);
                HttpResponse::InternalServerError().json(serde_json::json!({ "error": "An internal error occurred during authentication" }))
            }
        }
    }
}

// --- Middleware Implementation ---

pub struct ApiKeyAuth;

impl<S: 'static, B> Transform<S, ServiceRequest> for ApiKeyAuth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = ActixError>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = ActixError;
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
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = ActixError> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = ActixError;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        // Clone the necessary parts of AppState or the whole thing if cheap
        let db_pool = match req.app_data::<web::Data<crate::models::AppState>>() {
            Some(data) => data.db.clone(), // Clone the pool
            None => {
                 log::error!("AppState not found in request for ApiKeyAuthMiddleware");
                 let err = AuthError::InternalError(anyhow::anyhow!("AppState configuration error"));
                 // Must return a Future immediately for type match
                 return Box::pin(future::ready(Err(err.into())));
            }
        };


        // --- Static Key Check (Keep this for testing/admin bypass) ---
        let auth_header_opt = req.headers().get("Authorization").and_then(|h| h.to_str().ok());
        if let Some(header_str) = auth_header_opt {
             if header_str.starts_with("Bearer ") {
                let token = &header_str["Bearer ".len()..];
                const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123"; // Ensure this is defined
                const ADMIN_USERNAME: &str = "admin";

                if token == STATIC_ADMIN_KEY {
                    // Spawn blocking is generally better for DB calls, but okay for one-off here
                    // Or make get_user_by_username async if not already
                    let service_clone = service.clone(); // Clone service for this branch
                    return Box::pin(async move {
                         log::warn!("Using static debug API key for user: {}", ADMIN_USERNAME);
                         match api_key::get_user_by_username(&db_pool, ADMIN_USERNAME).await {
                            Ok(user) => {
                                req.extensions_mut().insert(user);
                                service_clone.call(req).await
                            }
                            Err(e) => {
                                log::error!("Failed to fetch static key user '{}': {}", ADMIN_USERNAME, e);
                                let auth_err = AuthError::InternalError(anyhow::anyhow!("Static user lookup failed"));
                                Err(auth_err.into())
                            }
                         }
                    });
                }
            }
        }
        // --- End Static Key Check ---


        // Proceed with normal API key verification
        Box::pin(async move {
            let auth_header = req.headers().get("Authorization");

            let token_result: Result<&str, AuthError> = match auth_header {
                Some(header_value) => {
                    match header_value.to_str() {
                        Ok(header_str) => {
                            if !header_str.starts_with("Bearer ") {
                                Err(AuthError::InvalidHeader)
                            } else {
                                Ok(&header_str["Bearer ".len()..]) // Extract token
                            }
                        },
                        Err(_) => Err(AuthError::InvalidHeader),
                    }
                },
                None => Err(AuthError::NoCredentials),
            };

            match token_result {
                Ok(token) => {
                    // Call the new verification function from api_key module
                    match api_key::verify_api_key(&db_pool, token).await {
                        Ok((api_key_record, user)) => {
                            log::debug!("Authentication successful for user: {}", user.user_name);
                            let key_id = api_key_record.id; // Capture id before moving user
                            req.extensions_mut().insert(user); // Insert user data

                            // Spawn a background task to update last_used_at without blocking
                            let pool_clone = db_pool.clone();
                            tokio::spawn(async move {
                                if let Err(e) = api_key::update_last_used(&pool_clone, key_id).await {
                                    log::error!("Failed to update last_used_at for key_id {}: {}", key_id, e);
                                }
                            });

                            // Call the next service
                            service.call(req).await
                        }
                        Err(api_key_error) => {
                             // Map ApiKeyError to AuthError before converting to ActixError
                             let auth_error = AuthError::ApiKeyVerificationFailed(api_key_error);
                             Err(auth_error.into())
                        }
                    }
                }
                Err(auth_error) => {
                    // Authentication failed (NoCredentials, InvalidHeader)
                     Err(auth_error.into()) // Convert AuthError to ActixError
                }
            }
        })
    }
}