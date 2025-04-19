use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};
use log::{debug, error, warn};
use tokio;

use crate::{
    api_key::{self, get_user_by_auth0_sub, verify_api_key},
    app_state::AppState,
    models::Error,
};

const STATIC_ADMIN_KEY: &str = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";
const ADMIN_USERNAME: &str = "admin";

pub async fn auth(
    State(app_state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, Error> {
    let db_pool = app_state.db;

    let Some(token) = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|header| header.to_str().ok())
        .take_if(|header| header.starts_with("Bearer "))
        .map(|header| &header["Bearer ".len()..])
    else {
        return Err(Error::NoCredentials);
    };

    let user = if token == STATIC_ADMIN_KEY {
        warn!(ADMIN_USERNAME; "using static debug API key for user");

        get_user_by_auth0_sub(&db_pool, ADMIN_USERNAME).await?
    } else {
        let (api_key_record, user) = verify_api_key(&db_pool, token).await?;
        let key_id = api_key_record.id;

        debug!(user = user.auth0_sub; "authentication successful");

        let pool_clone = db_pool.clone();
        tokio::spawn(async move {
            if let Err(error) = api_key::update_last_used(&pool_clone, key_id).await {
                error!(key_id, error:%; "failed to update last_used_at");
            }
        });

        user
    };

    request.extensions_mut().insert(user);

    Ok(next.run(request).await)
}
