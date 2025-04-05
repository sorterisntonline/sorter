use axum::{
    extract::{Query, State}, // Import State extractor
    routing::get,
    Json, Router, response::{IntoResponse, Response}, http::StatusCode,
};
use rspotify::{
    model::{Country, SimplifiedAlbum, FullArtist, FullTrack, Market, SearchType}, prelude::* // Import necessary enums/structs
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
pub struct SearchResult {
    pub albums: Vec<SimplifiedAlbum>,
    pub artists: Vec<FullArtist>,
    pub tracks: Vec<FullTrack>,
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
) -> Result<Json<SearchResult>, SpotifySearchError> // Use custom error type
{
    log::info!("Searching for albums with query: {}", params.q);

    // Access the Spotify client from the state
    let spotify = &app_state.spotify_client;

    // Perform the search using rspotify
    let search_result = spotify.search_multiple(
        &params.q,
        [SearchType::Album, SearchType::Artist, SearchType::Track],
        Some(Market::Country(Country::UnitedStates)), // Specify market (optional but recommended)
        None, // Specify language locale (optional)
        Some(10), // Limit number of results
        None, // Offset (for pagination)
    ).await?; // Propagate rspotify::ClientError (converted via From)

    // Process the search results
    match (search_result.albums, search_result.artists, search_result.tracks) {
        (Some(albums), Some(artists), Some(tracks)) => {
            Ok(Json(SearchResult { albums: albums.items, 
                                   artists: artists.items, 
                                   tracks: tracks.items }))
        }
        _ => {
            return Err(SpotifySearchError::InternalError("Unexpected search result type".to_string()));
        }
    }
}

// Routes function remains the same, but handlers now use State extractor
pub fn routes() -> Router<crate::app_state::AppState> {
    Router::new()
        .route("/search", get(search_albums))
    // Add other Spotify related routes here if needed
}

// Remove the standalone get_spotify_client() function from this file
// async fn get_spotify_client() -> Result<ClientCredsSpotify> { ... }
