use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use tokio;

use crate::{
    api_key::{self},
    app_state::AppState,
    models::Error,
};

const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";
const ADMIN_USERNAME: &str = "admin";

// Middleware that attempts authentication but allows requests without a token.
// Rejects requests ONLY if a token is provided but is invalid.
pub async fn try_auth(
    State(app_state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, Error> {
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
    let Some(token) = header.strip_prefix("Bearer ") else {
        // Header present but malformed
        return Err(Error::InvalidHeader);
    };

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
                return Err(Error::Internal(anyhow::anyhow!(
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
        Err(_) => {
            // Token was provided but verification failed
            Err(Error::Unauthorized)
        }
    }
}
