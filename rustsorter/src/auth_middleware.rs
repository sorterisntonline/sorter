use axum::{
    extract::{Request, State},
    http::{header, HeaderMap},
    middleware::Next,
    response::Response,
};
use tokio;
use uuid::Uuid;

use crate::{
    api_key::{self},
    app_state::AppState,
    models::Error,
    sessions,
};

const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";
const ADMIN_USERNAME: &str = "admin";

pub fn extract_session_id_from_cookie(headers: &HeaderMap) -> Option<Uuid> {
    let cookie_header = headers.get(header::COOKIE)?.to_str().ok()?;
    
    for cookie in cookie_header.split(';') {
        let cookie = cookie.trim();
        if let Some(session_value) = cookie.strip_prefix("session_id=") {
            if let Ok(session_id) = Uuid::parse_str(session_value) {
                return Some(session_id);
            }
        }
    }
    None
}

// Middleware that attempts authentication but allows requests without a token.
// Tries session cookie first, then API key. Rejects ONLY if auth is provided but invalid.
pub async fn try_auth(
    State(app_state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, Error> {
    let db_pool = app_state.db;
    let headers = request.headers();

    // Try session cookie first
    if let Some(session_id) = extract_session_id_from_cookie(headers) {
        log::debug!("Found session cookie, verifying session: {}", session_id);
        
        match sessions::get_session_with_user(&db_pool, session_id).await {
            Ok(Some((session, Some(user)))) if session.session_type == "full" => {
                log::debug!("Valid full session found for user: {}", user.handle);
                request.extensions_mut().insert(user);
                return Ok(next.run(request).await);
            }
            Ok(Some((session, None))) if session.session_type == "temp" => {
                log::debug!("Valid temp session found, but no user attached");
                // Temp sessions don't authenticate a user, but we don't fail the request
                return Ok(next.run(request).await);
            }
            Ok(Some((_, _))) => {
                log::debug!("Session found but doesn't match expected patterns");
                // Continue to try API key auth
            }
            Ok(None) => {
                log::debug!("Session not found or expired");
                // Continue to try API key auth
            }
            Err(e) => {
                log::warn!("Error checking session: {}", e);
                // Continue to try API key auth
            }
        }
    }

    // Try API key authentication
    let auth_header = headers
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    // If no auth header is present either, proceed without inserting a user
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
        match api_key::get_user_by_handle(&db_pool, ADMIN_USERNAME).await {
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
            log::debug!("Authentication successful for user: {}", user.handle);
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
