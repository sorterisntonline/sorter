pub mod feed;
pub mod pagerank;
pub mod pair;
pub mod perms;
pub mod tag;

pub struct AppState {
    pub db: sqlx::PgPool,
}

use std::{env, sync::Arc};

use actix_web::{App, HttpServer, middleware::Logger, web, HttpResponse, get};
use dotenv::dotenv;
use tokio::sync::oneshot; // For clean shutdown
use serde_json::json;

// Health endpoint handler
#[get("/api/health")]
async fn health() -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "status": "healthy",
        "version": env!("CARGO_PKG_VERSION")
    }))
}

#[actix_web::main]
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

    // Shared application state
    let app_state = Arc::new(AppState { db: pool.clone() });

    // Graceful shutdown handling
    let (tx, rx) = oneshot::channel::<()>();
    let state_clone = Arc::clone(&app_state);

    // Start the HTTP server
    let server = HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState { db: pool.clone() }))
            .service(tag::hello)
            .service(feed::feed)
            .service(health)
            .wrap(Logger::default())
    })
    .bind(("127.0.0.1", 8081)).expect("unable to bind on port 8081")
    .run().await?;

    Ok(server)
}