use actix_web::middleware::Logger;
use actix_web::{web, App, HttpServer};

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

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(rustsorter::AppState { db: pool.clone() }))
            .service(rustsorter::tag::hello)
            .service(rustsorter::feed::feed)
            .service(rustsorter::frontpage::hierarchy)
            .service(rustsorter::tag2::hello2)
            .wrap(Logger::default())
    })
    .bind(("127.0.0.1", 8081))?
    .run()
    .await
}
