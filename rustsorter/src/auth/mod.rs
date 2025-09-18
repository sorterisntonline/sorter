pub mod endpoints;
pub mod spotify;

use axum::{
    Router,
    routing::{get, post},
};

use crate::app_state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/spotify", get(spotify::spotify_login))
        .route("/spotify/callback", get(spotify::spotify_callback))
        .route("/spotify/link", get(spotify::spotify_link))
        .route("/status", get(endpoints::session_status))
        .route("/complete-signup", post(endpoints::complete_signup))
        .route("/logout", post(endpoints::logout))
        .route("/me", get(endpoints::me))
        .route("/check-handle", get(endpoints::check_handle))
}
