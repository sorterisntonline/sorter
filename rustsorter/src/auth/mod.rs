pub mod steam;

use aide::axum::{ApiRouter, routing::get_with};
use crate::app_state::AppState;

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/steam", get_with(steam::steam_login, |op| {
            op.description("Initiate Steam OAuth login")
        }))
        .api_route("/steam/callback", get_with(steam::steam_callback, |op| {
            op.description("Handle Steam OAuth callback")
        }))
}
