pub mod discord;
pub mod feed;
pub mod frontpage;
pub mod pagerank;
pub mod pair;
pub mod perms;
pub mod tag;
pub mod tag2;
pub mod types;

pub struct AppState {
    pub db: sqlx::PgPool,
}

use std::{env, sync::Arc};

use actix_web::{App, HttpServer, middleware::Logger, web};
use dotenv::dotenv;
use tokio::sync::oneshot; // For clean shutdown

#[actix_web::main]
async fn main() -> std::io::Result<()> {
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
    let (tx, rx) = oneshot::channel();
    let state_clone = Arc::clone(&app_state);

    // Start the HTTP server
    let server = HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState { db: pool.clone() }))
            .service(tag::hello)
            .service(feed::feed)
            .service(frontpage::hierarchy)
            .service(tag2::hello2)
            .wrap(Logger::default())
    })
    .bind(("127.0.0.1", 8081))?
    .run();

    let _ = server.await;
    let _ = tx.send(());

    Ok(())
}
