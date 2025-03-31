pub mod feed;
pub mod pagerank;
pub mod pair;
pub mod perms;
pub mod tag;
pub mod models;
pub mod tag_routes;
pub mod app_state;
use std::env;
use std::collections::HashMap;
use std::sync::Arc;

// Removed Actix-Web imports
// Added Axum and related imports
use axum::{
    routing::{get, post}, // Import routing methods
    Router, Server, Json, Extension, // Import core Axum types
    response::{IntoResponse, Response}, // For responses
    http::StatusCode, // For status codes
    middleware, extract::State, extract::Request, // For middleware and extractors
};
use tower_http::trace::TraceLayer; // For logging middleware
use dotenv::dotenv;
use serde_json::json;
use tokio;
// use rustsorter::auth_middleware::ApiKeyAuth;
use rustsorter::models::User;
//

// Health endpoint handler
#[get("/api/health")]
async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

// Add new protected route
// Example Axum handler signature
async fn protected_route(
    Extension(user): Extension<User> // Use Axum's Extension extractor (assuming middleware adds it)
) -> impl IntoResponse {
    // User is guaranteed by middleware or the request wouldn't reach here
    (StatusCode::OK, Json(json!({
        "message": format!("Hello, {}! This is a protected route.", user.user_name),
        "authenticated_user": user.user_name
    })))
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

    // Create shared app state (No specific wrapper needed like web::Data)
    let app_state = app_state::AppState { db: pool.clone() };

    // Start the HTTP server
    // Define the Axum router
    let app = Router::new()
        // Public Routes
        .route("/api/health", get(health)) // Use axum::routing::get
        // Protected API Key Management Routes need middleware
        .nest("/api", api_routes()) // Nest API routes
        // Apply middleware and state
        .with_state(app_state) // Provide state to all handlers
        .layer(TraceLayer::new_for_http()); // Add logging middleware

    // Define listener address
    let addr = "127.0.0.1:8081".parse().unwrap();
    log::info!("Starting server on {}", addr);

    // Run the server
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app.into_make_service())
        .await
        .expect("Failed to start server");

    Ok(())
}

// Helper function to define nested API routes with middleware
fn api_routes() -> Router<app_state::AppState> {
    Router::new()
        .route("/protected", get(protected_route))
        .nest("/keys", rustsorter::api_key::routes()) // Get routes from api_key module
        .nest("/tags", rustsorter::tag_routes::routes()) // Get routes from tag_routes module
        // .route("/feed", get(feed::feed)) // Assuming feed::feed is refactored
        // Apply the authentication middleware to all routes in this router
        .layer(rustsorter::auth_middleware::ApiKeyAuth)
}