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
        .route("/import-recent-songs", post(endpoints::import_recent_songs))
        .route("/spotify-songs", get(endpoints::get_user_spotify_songs))
        .route("/spotify-token", get(endpoints::get_spotify_access_token))
}
