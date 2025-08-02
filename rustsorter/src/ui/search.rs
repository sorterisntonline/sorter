use aide::axum::{routing::get_with, ApiRouter, IntoApiResponse};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use schemars::JsonSchema;
use serde::Deserialize;
use crate::{
    app_state::AppState, 
    models::Json,
    ui::types::{UIResponse, SearchResult, EntityType},
};

#[derive(Deserialize, JsonSchema)]
pub struct SearchQuery {
    q: String,
}

// Remove the old structs since we're using UIResponse now

async fn search(
    Query(params): Query<SearchQuery>,
    State(_app_state): State<AppState>,
) -> impl IntoApiResponse {
    let query = params.q.trim();
    
    // Return different UI responses based on the query
    let ui_response = if query.is_empty() {
        UIResponse::home_page(None)
    } else if query.contains("reddit.com/r/") {
        // Mock Reddit subreddit results
        let results = vec![
            SearchResult {
                title: format!("Top posts from {}", extract_subreddit(query).unwrap_or("unknown")),
                url: query.to_string(),
                snippet: Some("Hot posts from this subreddit".to_string()),
                score: Some(95.5),
                entity_type: EntityType::RedditSubreddit,
            },
            SearchResult {
                title: "Sample Reddit Post 1".to_string(),
                url: format!("{}/comments/abc123/sample_post", query),
                snippet: Some("This is a sample Reddit post for testing".to_string()),
                score: Some(87.2),
                entity_type: EntityType::RedditPost,
            },
        ];
        UIResponse::search_results(query.to_string(), results)
    } else if query.contains("youtube.com") || query.contains("youtu.be") {
        // Mock YouTube results
        let results = vec![
            SearchResult {
                title: "YouTube Video".to_string(),
                url: query.to_string(),
                snippet: Some("Video content from YouTube".to_string()),
                score: Some(92.1),
                entity_type: EntityType::YouTubeVideo,
            },
        ];
        UIResponse::search_results(query.to_string(), results)
    } else {
        // Generic web page
        let results = vec![
            SearchResult {
                title: format!("Web page: {}", query),
                url: query.to_string(),
                snippet: Some("Generic web content".to_string()),
                score: Some(75.0),
                entity_type: EntityType::WebPage,
            },
        ];
        UIResponse::search_results(query.to_string(), results)
    };

    (StatusCode::OK, Json(ui_response)).into_response()
}

// Helper function to extract subreddit name from URL
fn extract_subreddit(url: &str) -> Option<&str> {
    if let Some(start) = url.find("/r/") {
        let subreddit_start = start + 3;
        let subreddit_part = &url[subreddit_start..];
        if let Some(end) = subreddit_part.find('/') {
            Some(&subreddit_part[..end])
        } else {
            Some(subreddit_part)
        }
    } else {
        None
    }
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route(
        "/",
        get_with(search, |op| {
            op.description("Search for content and return structured UI response")
                .response::<200, Json<UIResponse>>()
        }),
    )
}