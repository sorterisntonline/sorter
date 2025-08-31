pub mod api_key;
pub mod app_state;
pub mod auth_middleware;
pub mod entity;
pub mod entity_relationships;
pub mod extractors;
pub mod models;
pub mod pagerank;
pub mod pair;
pub mod replay;
pub mod vote;
use std::{env, sync::Arc};

use aide::{
    axum::{
        ApiRouter, IntoApiResponse,
        routing::{get, get_with},
    },
    openapi::{self, OpenApi, SecurityScheme},
    swagger::Swagger,
    transform::TransformOpenApi,
};
use anyhow::Result;
use app_state::AppState;
use axum::{
    Extension, Router,
    http::StatusCode,
    middleware,
    response::{IntoResponse, Response},
};
use dotenv::dotenv;
use schemars::JsonSchema;
use serde::Serialize;
use tower_http::trace::TraceLayer;

use crate::{
    extractors::maybe_user::MaybeUser,
    models::{Error, Json},
};

#[derive(Serialize, JsonSchema)]
struct HealthResponse {
    status: String,
    version: String,
}

async fn health() -> (StatusCode, Json<HealthResponse>) {
    (
        StatusCode::OK,
        Json(HealthResponse {
            status: "healthy".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }),
    )
}

async fn api_json(Extension(api): Extension<Arc<OpenApi>>) -> impl IntoApiResponse {
    Json(api).into_response()
}

#[derive(Serialize, JsonSchema)]
struct ProtectedResponse {
    message: String,
    authenticated_user: String,
}

async fn protected_route(MaybeUser(maybe_user): MaybeUser) -> Response {
    match maybe_user {
        None => Error::NoCredentials.into_response(),
        Some(user) => (
            StatusCode::OK,
            Json(ProtectedResponse {
                message: format!("Hello, {}! This is a protected route.", user.auth0_sub),
                authenticated_user: user.auth0_sub,
            }),
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

    let addr = "127.0.0.1:8081";
    log::info!("Starting server on {}", addr);

    axum::serve(
        tokio::net::TcpListener::bind(addr).await.unwrap(),
        router.into_make_service(),
    )
    .await
    .expect("Failed to start server");

    Ok(())
}

fn router(app_state: AppState) -> Router {
    let routes = ApiRouter::new()
        .api_route(
            "/docs",
            get_with(Swagger::new("/api.json").axum_handler(), |op| {
                op.description("Show this page.")
            }),
        )
        .api_route(
            "/health",
            get_with(health, |op| {
                op.description("Check health of the server.")
                    .response::<200, Json<HealthResponse>>()
            }),
        )
        .api_route(
            "/protected",
            get_with(protected_route, |op| {
                op.description("Get authenticated user information.")
                    .response::<200, Json<ProtectedResponse>>()
            }),
        )
        .nest("/keys", api_key::routes())
        .nest("/entity", entity::routes())
        .nest("/entity_relationships", entity_relationships::routes())
        .nest("/pair", pair::routes())
        .nest("/vote", vote::routes())
        .nest("/rank", pagerank::routes())
        .nest("/run", replay::routes())
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware::try_auth,
        ));

    let mut api = OpenApi::default();
    ApiRouter::new()
        .nest("/api", routes)
        .route("/api.json", get(api_json))
        .finish_api_with(&mut api, api_transform)
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
        .layer(Extension(Arc::new(api)))
}

fn api_transform(api: TransformOpenApi) -> TransformOpenApi {
    api.title("sorter.social")
        .description("HTTP API for sorter.social")
        .version(env!("CARGO_PKG_VERSION"))
        .contact(openapi::Contact {
            name: Some("support".to_owned()),
            email: Some("hi@sorter.social".to_owned()),
            url: None,
            extensions: Default::default(),
        })
        .security_scheme(
            "ApiKey",
            SecurityScheme::ApiKey {
                location: openapi::ApiKeyLocation::Header,
                name: "Authorization".to_owned(),
                description: Some("API key for authentication, starts with `Bearer `".to_owned()),
                extensions: Default::default(),
            },
        )
}
