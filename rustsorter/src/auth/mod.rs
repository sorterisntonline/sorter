pub mod steam;

use aide::axum::ApiRouter;
use axum::{routing::get, Router};
use crate::app_state::AppState;

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::from(Router::new()
        .route("/steam", get(steam::steam_login))
        .route("/steam/callback", get(steam::steam_callback)))
}
