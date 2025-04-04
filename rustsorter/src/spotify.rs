use axum::{
    extract::{Query, State}, // Import State extractor
    routing::get,
    Json, Router, response::{IntoResponse, Response}, http::StatusCode,
};
use rspotify::{
    model::{Country, SimplifiedAlbum, Market, SearchType}, prelude::* // Import necessary enums/structs
};
use serde::{Deserialize, Serialize};
// Remove unused imports if get_spotify_client is no longer here
// use rspotify::ClientCredsSpotify;
// use rspotify::AuthCodeSpotify;
// use std::env;
// use anyhow::Result;

// Keep the query struct
#[derive(Deserialize)]
pub struct AlbumSearchQuery {
    q: String, // The search query string
}

#[derive(Serialize)]
pub struct AlbumSearchResponse {
    pub results: Vec<SimplifiedAlbum>,
}

// Define a custom error type for the handler
enum SpotifySearchError {
    SpotifyApiError(rspotify::ClientError),
    InternalError(String),
}

// Implement IntoResponse for the custom error
impl IntoResponse for SpotifySearchError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            SpotifySearchError::SpotifyApiError(e) => {
                log::error!("Spotify API error: {}", e);
                (StatusCode::BAD_GATEWAY, format!("Spotify API error: {}", e))
            }
            SpotifySearchError::InternalError(msg) => {
                 log::error!("Internal search error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Internal server error: {}", msg))
            }
        };
        (status, Json(serde_json::json!({ "error": error_message }))).into_response()
    }
}

// Map rspotify errors to our custom error type
impl From<rspotify::ClientError> for SpotifySearchError {
    fn from(err: rspotify::ClientError) -> Self {
        SpotifySearchError::SpotifyApiError(err)
    }
}


// Updated search_albums handler
async fn search_albums(
    State(app_state): State<crate::app_state::AppState>, // Extract AppState
    Query(params): Query<AlbumSearchQuery>,
) -> Result<Json<AlbumSearchResponse>, SpotifySearchError> // Use custom error type
{
    log::info!("Searching for albums with query: {}", params.q);

    // Access the Spotify client from the state
    let spotify = &app_state.spotify_client;

    // Perform the search using rspotify
    // We search for Albums, limit to 10 results, and search in the US market
    // Adjust Market, limit, offset, AlbumType as needed
    let search_result = spotify.search(
        &params.q,
        SearchType::Album, // Specify search type
        Some(Market::Country(Country::UnitedStates)), // Specify market (optional but recommended)
        None, // Specify language locale (optional)
        Some(10), // Limit number of results
        None, // Offset (for pagination)
    ).await?; // Propagate rspotify::ClientError (converted via From)

    // Process the search results
    let albums = match search_result {
        rspotify::model::SearchResult::Albums(album_page) => album_page.items,
        _ => {
            // This shouldn't happen if we specify SearchType::Album
            log::error!("Unexpected search result type received from Spotify.");
            return Err(SpotifySearchError::InternalError("Unexpected search result type".to_string()));
        }
    };

    // Map the rspotify FullAlbum results to our AlbumSearchResult struct
    Ok(Json(AlbumSearchResponse { results: albums }))
}

// Routes function remains the same, but handlers now use State extractor
pub fn routes() -> Router<crate::app_state::AppState> {
    Router::new()
        .route("/albums/search", get(search_albums))
    // Add other Spotify related routes here if needed
}

// Remove the standalone get_spotify_client() function from this file
// async fn get_spotify_client() -> Result<ClientCredsSpotify> { ... }
