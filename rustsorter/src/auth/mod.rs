pub mod endpoints;
pub mod spotify;

use axum::{routing::{get, post}, Router};
use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/spotify", get(spotify::spotify_login))
        .route("/spotify/callback", get(spotify::spotify_callback))
        .route("/status", get(endpoints::session_status))
        .route("/complete-signup", post(endpoints::complete_signup))
        .route("/logout", post(endpoints::logout))
        .route("/me", get(endpoints::me))
        .route("/check-handle", get(endpoints::check_handle))
}
