pub mod api_key;
pub mod app_state;
pub mod auth_middleware;
pub mod entity;
pub mod entity_relationships;
pub mod extractors;
pub mod models;
pub mod pagerank;
pub mod pair;
pub mod vote;
use std::env;

use anyhow::Result;
use app_state::AppState;
use axum::{Json, Router, http::StatusCode, middleware, response::IntoResponse, routing::get};
use dotenv::dotenv;
use serde_json::json;
use tower_http::trace::TraceLayer;

use crate::{extractors::maybe_user::MaybeUser, models::Error};

async fn health() -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION")
        })),
    )
}

async fn protected_route(MaybeUser(maybe_user): MaybeUser) -> impl IntoResponse {
    match maybe_user {
        None => Error::NoCredentials.into_response(),
        Some(user) => (
            StatusCode::OK,
            Json(json!({
                "message": format!("Hello, {}! This is a protected route.", user.auth0_sub),
                "authenticated_user": user.auth0_sub
            })),
        )
            .into_response(),
    }
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

    let app_state = AppState { db: pool.clone() };

    let router = router(app_state);

    let addr = "127.0.0.1:8081";
    log::info!("Starting server on {}", addr);

    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), router)
        .await
        .expect("Failed to start server");

    Ok(())
}

fn router(app_state: AppState) -> Router {

    let routes = Router::new()
        .route("/health", get(health))
        .route("/protected", get(protected_route))
        .nest("/keys", api_key::routes())
        .nest("/entity", entity::routes())
        .nest("/entity_relationships", entity_relationships::routes())
        .nest("/vote", vote::routes())
        .nest("/rank", pagerank::routes())
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware::try_auth,
        ));

    Router::new()
        .nest("/api", routes)
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
}
