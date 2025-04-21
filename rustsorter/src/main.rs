pub mod api_key;
pub mod app_state;
pub mod auth_middleware;
pub mod entity;
pub mod entity_relationships;
pub mod extractors;
pub mod models;
pub mod pagerank;
pub mod pair;
pub mod spotify;
pub mod vote;
use std::env;

use anyhow::Result;
use api_key::get_user_by_auth0_sub;
use app_state::AppState;
use axum::{Json, Router, http::StatusCode, middleware, response::IntoResponse, routing::get};
use dotenv::dotenv;
use models::User;
use rspotify::{ClientCredsSpotify, Config, Credentials};
use serde_json::json;
use tower_http::trace::TraceLayer;

async fn health() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION")
        })),
    )
}

async fn protected_route() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
            "message": "Hello! This is a protected route.",
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

async fn get_spotify_user(db: &sqlx::PgPool) -> Result<User> {
    let user = get_user_by_auth0_sub(db, "spotify").await?;
    Ok(user)
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

    let app_state = AppState {
        db: pool.clone(),
        spotify_client: get_spotify_client().await?,
        spotify_user: get_spotify_user(&pool).await?,
    };

    let router = router(app_state);

    let addr = "127.0.0.1:8081";
    log::info!("Starting server on {}", addr);

    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), router)
        .await
        .expect("Failed to start server");

    Ok(())
}

fn router(app_state: AppState) -> Router {
    let public_routes = Router::new()
        .route("/health", get(health))
        .nest("/entity", entity::public_routes());

    let protected_routes = Router::new()
        .route("/protected", get(protected_route))
        .nest("/keys", api_key::routes())
        .nest("/entity", entity::protected_routes())
        .nest("/entity_relationships", entity_relationships::routes())
        .nest("/spotify", spotify::routes())
        .nest("/vote", vote::routes())
        .nest("/rank", pagerank::routes())
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware::auth,
        ));

    Router::new()
        .nest("/api", public_routes)
        .nest("/api", protected_routes)
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
}
