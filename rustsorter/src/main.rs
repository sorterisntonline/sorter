use actix_web::middleware::Logger;
use actix_web::{web, App, HttpServer};
use dotenv::dotenv;
use std::env;
use std::sync::Arc;
use tokio::sync::oneshot; // For clean shutdown
use rustsorter::discord_bot;
use rustsorter::AppState;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logging and dotenv
    env_logger::init();
    dotenv().ok();

    // Determine the environment and database URL
    let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string());
    let database_string = if environment == "production" {
        env::var("PROD_DATABASE_URL").expect("PROD_DATABASE_URL must be set when ENVIRONMENT=production")
    } else {
        env::var("DATABASE_URL").expect("DATABASE_URL must be set")
    };

    // Create the database pool
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_string)
        .await
        .expect("Unable to connect to database");

    // Shared application state
    let app_state = Arc::new(AppState { db: pool.clone() });

    // Graceful shutdown handling
    let (tx, rx) = oneshot::channel();
    let state_clone = Arc::clone(&app_state);
    let discord_handle = tokio::spawn(async move {
        let result = discord_bot::run(state_clone, rx).await;
        result; // Handle errors from discord_bot.run (if any)
    });

    // Start the HTTP server
    let server = HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState { db: pool.clone() }))
            .service(rustsorter::tag::hello)
            .service(rustsorter::feed::feed)
            .service(rustsorter::frontpage::hierarchy)
            .service(rustsorter::tag2::hello2)
            .wrap(Logger::default())
    })
    .bind(("127.0.0.1", 8081))?
    .run();

    let _ = server.await;
    let _ = tx.send(());

    discord_handle.await.expect("Discord bot failed to start");

    Ok(())
}