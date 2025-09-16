pub mod api_key;
pub mod app_state;
pub mod auth;
pub mod auth_middleware;
mod config;
pub mod entity;
pub mod entity_relationships;
pub mod extractors;
pub mod models;
pub mod pagerank;
pub mod pair;
pub mod vote;
use std::sync::Arc;

use aide::{
    axum::{
        ApiRouter,
        IntoApiResponse,
        routing::{get, get_with},
    },
    openapi::{self, OpenApi, SecurityScheme},
    swagger::Swagger,
    transform::TransformOpenApi,
};
use anyhow::Result;
use app_state::AppState;
use axum::{
    Extension,
    Router,
    http::StatusCode,
    middleware,
    response::{IntoResponse, Response},
};
use dotenv::dotenv;
use schemars::JsonSchema;
use serde::Serialize;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

use crate::{
    config::AppConfig,
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
                message: format!("Hello, {}! This is a protected route.", user.handle),
                authenticated_user: user.handle.clone(),
            }),
        )
            .into_response(),
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    dotenv().ok();
    env_logger::init();
    eprintln!("[rustsorter] starting up...");
    let args: Vec<String> = std::env::args().collect();
    eprintln!("[rustsorter] args: {:?}", args);

    let config = match AppConfig::from_env() {
        Ok(config) => config,
        Err(err) => {
            eprintln!("[rustsorter] ERROR: {}", err);
            std::process::exit(1);
        }
    };

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await
        .expect("Unable to connect to database");

    let app_state = AppState {
        db: pool.clone(),
        steam_api_key: config.steam_api_key.clone(),
        base_url: config.base_url.clone(),
        frontend_url: config.frontend_url.clone(),
    };

    let router = router(app_state, config.static_dir.clone());
    let addr = format!("0.0.0.0:{}", config.port);
    log::info!("Starting server on {}", addr);
    eprintln!("[rustsorter] binding to {}", addr);

    axum::serve(
        tokio::net::TcpListener::bind(&addr)
            .await
            .unwrap_or_else(|e| {
                eprintln!("[rustsorter] ERROR: failed to bind {}: {}", addr, e);
                std::process::exit(1);
            }),
        router.into_make_service(),
    )
    .await
    .expect("Failed to start server");

    Ok(())
}

fn router(app_state: AppState, static_dir: Option<String>) -> Router {
    let api_routes = ApiRouter::new()
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
        .layer(middleware::from_fn_with_state(
            app_state.clone(),
            auth_middleware::try_auth,
        ));

    let mut api = OpenApi::default();
    let router = ApiRouter::new()
        .nest("/api", api_routes)
        .nest("/api/auth", auth::routes()) // Auth routes without middleware
        .route("/api.json", get(api_json))
        .finish_api_with(&mut api, api_transform)
        .with_state(app_state)
        .layer(TraceLayer::new_for_http())
        .layer(Extension(Arc::new(api)));

    // Static file serving for the built React app.
    // for dev, use vite's dev server. these routes are only for production

    if let Some(dir) = static_dir {
        let index_path = format!("{}/index.html", dir);
        let assets_path = format!("{}/assets", dir);

        let router = router
            // Serve built asset files under /assets
            .nest_service("/assets", ServeDir::new(assets_path))
            // Serve common top-level static files
            .route_service("/vite.svg", ServeFile::new(format!("{}/vite.svg", dir)))
            // Serve index.html at the root
            .route_service("/", ServeFile::new(index_path.clone()))
            // SPA fallback: serve index.html for all other routes
            .fallback_service(ServeFile::new(index_path));

        router
    } else {
        // If no static directory is present, just return the API router.
        router
    }
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
