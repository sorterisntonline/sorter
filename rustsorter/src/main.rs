pub mod api_key;
pub mod app_state;
pub mod auth_middleware;
pub mod entity;
pub mod entity_relationships;
pub mod models;
pub mod pagerank;
pub mod pair;
pub mod spotify;
pub mod vote;

use std::env;

use anyhow::Result;
use axum::{
    Extension,
    Json,
    Router,
    http::StatusCode,
    middleware,
    response::IntoResponse,
    routing::get,
};
use dotenv::dotenv;
use rspotify::{ClientCredsSpotify, Config, Credentials};
use serde_json::json;
use tower_http::trace::TraceLayer;

use crate::models::User;

async fn health() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION")
        })),
    )
}

async fn protected_route(Extension(user): Extension<User>) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
        "message": format!("Hello, {}! This is a protected route.", user.auth0_sub),
        "authenticated_user": user.auth0_sub
        })),
    )
}

async fn get_spotify_client() -> Result<ClientCredsSpotify> {
    let creds = Credentials::from_env().ok_or_else(|| {
        anyhow::anyhow!(
            "Spotify credentials (RSPOTIFY_CLIENT_ID, RSPOTIFY_CLIENT_SECRET) not found in \
             environment"
        )
    })?;

    let config = Config {
        token_refreshing: true,
        ..Default::default()
    };

    let spotify = ClientCredsSpotify::with_config(creds, config);

    spotify
        .request_token()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to get Spotify token: {}", e))?;
    log::info!("Successfully obtained Spotify token.");

    Ok(spotify)
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    dotenv().ok();
    env_logger::init();

    let database_string = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_string)
        .await
        .expect("Unable to connect to database");

    let app_state = rustsorter::app_state::AppState {
        db: pool.clone(),
        spotify_client: get_spotify_client().await?,
    };

    let app = Router::new()
        .route("/api/health", get(health))
        .nest("/api", api_routes(app_state.clone()))
        .with_state(app_state)
        .layer(TraceLayer::new_for_http());

    let addr = "127.0.0.1:8081";
    log::info!("Starting server on {}", addr);

    axum::serve(
        tokio::net::TcpListener::bind(addr).await.unwrap(),
        app.into_make_service(),
    )
    .await
    .expect("Failed to start server");

    Ok(())
}

fn api_routes(
    app_state: rustsorter::app_state::AppState,
) -> Router<rustsorter::app_state::AppState> {
    Router::new()
        .route("/protected", get(protected_route))
        .nest("/keys", rustsorter::api_key::routes())
        .nest("/entity", rustsorter::entity::routes())
        .layer(middleware::from_fn_with_state(
            app_state,
            rustsorter::auth_middleware::auth,
        ))
}
