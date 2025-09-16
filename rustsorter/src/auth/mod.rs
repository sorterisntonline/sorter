pub mod endpoints;
pub mod steam;

use axum::{routing::{get, post}, Router};
use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/steam", get(steam::steam_login))
        .route("/steam/callback", get(steam::steam_callback))
        .route("/status", get(endpoints::session_status))
        .route("/complete-signup", post(endpoints::complete_signup))
        .route("/logout", post(endpoints::logout))
        .route("/me", get(endpoints::me))
        .route("/check-handle", get(endpoints::check_handle))
}
