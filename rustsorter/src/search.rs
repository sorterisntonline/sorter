use aide::axum::{routing::get_with, ApiRouter, IntoApiResponse};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use crate::{app_state::AppState, models::Json};

#[derive(Deserialize, JsonSchema)]
pub struct SearchQuery {
    q: String,
}

#[derive(Serialize, JsonSchema)]
pub struct SearchResult {
    query: String,
    message: String,
    // TODO: Add actual search results here
}

#[derive(Serialize, JsonSchema)]
pub struct SearchResponse {
    results: SearchResult,
}

async fn search(
    Query(params): Query<SearchQuery>,
    State(_app_state): State<AppState>,
) -> impl IntoApiResponse {
    let result = SearchResult {
        query: params.q.clone(),
        message: format!("Search results for: {}", params.q),
    };

    (
        StatusCode::OK,
        Json(SearchResponse { results: result }),
    )
        .into_response()
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route(
        "/",
        get_with(search, |op| {
            op.description("Search for content based on query parameter")
                .response::<200, Json<SearchResponse>>()
        }),
    )
}