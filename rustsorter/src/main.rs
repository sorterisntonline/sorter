pub mod app_state;
pub mod models;
pub mod pagerank;
pub mod pair;
use std::env;

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
use rustsorter::models::User;
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

async fn protected_route(Extension(user): Extension<User>) -> impl IntoResponse {
    (
        StatusCode::OK,
        Json(json!({
        "message": format!("Hello, {}! This is a protected route.", user.auth0_sub),
        "authenticated_user": user.auth0_sub
        })),
    )
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    env_logger::init();
    dotenv().ok();

    let database_string = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_string)
        .await
        .expect("Unable to connect to database");

    let app_state = rustsorter::app_state::AppState { db: pool.clone() };

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
