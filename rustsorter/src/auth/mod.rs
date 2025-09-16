pub mod endpoints;
pub mod steam;

use aide::axum::{ApiRouter, routing::{get_with, post_with}};
use axum::{routing::get, Router};
use crate::app_state::AppState;

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::from(Router::new()
        .route("/steam", get(steam::steam_login))
        .route("/steam/callback", get(steam::steam_callback)))
    .api_route("/status", get_with(endpoints::session_status, |op| {
        op.description("Get current session status and user info")
            .response::<200, crate::models::Json<endpoints::SessionStatusResponse>>()
    }))
    .api_route("/complete-signup", post_with(endpoints::complete_signup, |op| {
        op.description("Complete signup by choosing handle (temp session required)")
            .response::<200, crate::models::Json<endpoints::CompleteSignupResponse>>()
    }))
    .api_route("/logout", post_with(endpoints::logout, |op| {
        op.description("Logout and clear session")
            .response::<200, crate::models::Json<endpoints::LogoutResponse>>()
    }))
    .api_route("/me", get_with(endpoints::me, |op| {
        op.description("Get current authenticated user info")
            .response::<200, crate::models::Json<crate::models::User>>()
    }))
    .api_route("/check-handle", get_with(endpoints::check_handle, |op| {
        op.description("Check if handle is available and valid")
            .response::<200, crate::models::Json<endpoints::HandleAvailabilityResponse>>()
    }))
}
