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
    // Initialize logging and dotenv
    env_logger::init();
    dotenv().ok();

    // Retrieve the database URL from the environment
    let database_string = env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    // Create the database pool
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_string)
        .await
        .expect("Unable to connect to database");

    // Create shared app state
    let app_state = rustsorter::app_state::AppState { db: pool.clone() }; // Use qualified type name

    // Start the HTTP server
    // Define the Axum router
    let app = Router::new()
        // Public Routes
        .route("/api/health", get(health)) // Use axum::routing::get
        // Protected API Key Management Routes need middleware
        .nest("/api", api_routes(app_state.clone())) // Pass state when creating API routes
        // Apply middleware and state (Outer state needed if other routes outside /api need it)
        .with_state(app_state) // Provide state to all handlers
        .layer(TraceLayer::new_for_http()); // Add logging middleware

    // Define listener address
    let addr = "127.0.0.1:8081";
    log::info!("Starting server on {}", addr);

    // Run the server
    axum::serve(
        tokio::net::TcpListener::bind(addr).await.unwrap(),
        app.into_make_service(),
    )
    .await
    .expect("Failed to start server");

    Ok(())
}

// Helper function accepts AppState and uses from_fn_with_state
fn api_routes(
    app_state: rustsorter::app_state::AppState,
) -> Router<rustsorter::app_state::AppState> {
    Router::new()
        .route("/protected", get(protected_route))
        .nest("/keys", rustsorter::api_key::routes())
        .nest("/entity", rustsorter::entity::routes())
        .layer(middleware::from_fn_with_state(
            app_state,                         // The state to pass
            rustsorter::auth_middleware::auth, // The async function
        ))
}
