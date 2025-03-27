pub mod feed;
pub mod pagerank;
pub mod pair;
pub mod perms;
pub mod tag;
pub mod models;
use std::env;
use std::collections::HashMap;
use std::sync::Arc;

use actix_web::{App, HttpServer, middleware::Logger, web, HttpResponse, get, Error, HttpMessage};
use dotenv::dotenv;
use serde_json::json;
use tokio;
use rustsorter::auth_middleware::ApiKeyAuth;
use rustsorter::models::User;




// Health endpoint handler
#[get("/api/health")]
async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

// Add new protected route
#[get("/protected")]
async fn protected_route(req: actix_web::HttpRequest) -> Result<HttpResponse, Error> {
    if let Some(user) = req.extensions().get::<User>() {
        Ok(HttpResponse::Ok().json(json!({
            "message": format!("Hello, {}! This is a protected route.", user.user_name),
            "authenticated_user": user.user_name
        })))
    } else {
        Ok(HttpResponse::InternalServerError().body("User data not found after authentication"))
    }
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
    let app_state = web::Data::new(rustsorter::models::AppState { db: pool.clone() });

    // Start the HTTP server
    let server = HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            .wrap(Logger::default())
            // Public Routes
            .service(health)
            // Protected API Key Management Routes
            .service(
                web::scope("/api/keys")
                    .wrap(ApiKeyAuth)
                    .configure(rustsorter::api_key::config)
            )
            // Other Protected API Routes
            .service(
                web::scope("/api")
                    .wrap(ApiKeyAuth)
                    .service(protected_route)
                    .service(feed::feed)
            )
            .service(tag::hello)
    })
    .bind(("127.0.0.1", 8081)).expect("unable to bind on port 8081")
    .run().await?;

    Ok(server)
}