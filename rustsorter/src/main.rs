use actix_web::middleware::Logger;
use actix_web::{web, App, HttpServer};
use tokio::sync::oneshot; //For clean shutdown
use std::sync::Arc;
use rustsorter::discord_bot;
use rustsorter::AppState;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init();
    dotenv::dotenv().ok();

    let database_string = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_string)
        .await
        .expect("Unable to connect to database");

    let app_state = Arc::new(AppState { db: pool.clone() });

    let (tx, rx) = oneshot::channel(); //for graceful shutdown
    let state_clone = Arc::clone(&app_state);
    let discord_handle = tokio::spawn(async move {
        let result = discord_bot::run(state_clone, rx).await;
        //Handle errors from discord_bot.run (if any)
        result;
    });

    let server = HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(rustsorter::AppState { db: pool.clone() }))
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
