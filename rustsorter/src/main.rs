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

use aide::{
    axum::{ApiRouter, routing::get},
    openapi::{self, OpenApi},
};
use anyhow::Result;
use app_state::AppState;
use axum::{
    http::StatusCode,
    middleware,
    response::{IntoResponse, Response},
};
use dotenv::dotenv;
use serde_json::json;
use tower_http::trace::TraceLayer;

use crate::{
    extractors::maybe_user::MaybeUser,
    models::{Error, Json},
};

async fn health() -> (StatusCode, Json<serde_json::Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "status": "healthy",
            "version": env!("CARGO_PKG_VERSION")
        })),
    )
}

async fn protected_route(MaybeUser(maybe_user): MaybeUser) -> Response {
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
    let mut api = api();

    let addr = "127.0.0.1:8081";
    log::info!("Starting server on {}", addr);

    axum::serve(
        tokio::net::TcpListener::bind(addr).await.unwrap(),
        router.finish_api(&mut api).into_make_service(),
    )
    .await
    .expect("Failed to start server");

    Ok(())
}

fn router(app_state: AppState) -> ApiRouter {
    let routes = ApiRouter::new()
        .api_route("/health", get(health))
        .api_route("/protected", get(protected_route))
        .nest("/keys", api_key::routes())
        .nest("/entity", entity::routes())
        .nest("/entity_relationships", entity_relationships::routes())
        .nest("/vote", vote::routes())
        .nest("/rank", pagerank::routes())
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware::try_auth,
        ));

    ApiRouter::new()
        .nest("/api", routes)
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
}

fn api() -> OpenApi {
    OpenApi {
        info: openapi::Info {
            title: "sorter.social".to_owned(),
            description: Some("HTTP API for sorter.social".to_string()),
            summary: None,
            terms_of_service: None,
            contact: Some(openapi::Contact {
                name: Some("Sorter Support".to_owned()),
                url: None,
                email: Some("hi@sorter.social".to_owned()),
                extensions: Default::default(),
            }),
            license: None,
            version: env!("CARGO_PKG_VERSION").to_owned(),
            extensions: Default::default(),
        },
        openapi: "".into(),
        json_schema_dialect: None,
        servers: vec![],
        paths: None,
        webhooks: Default::default(),
        components: None,
        security: vec![],
        tags: vec![],
        external_docs: None,
        extensions: Default::default(),
    }
}
