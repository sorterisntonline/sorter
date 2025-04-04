use axum::{routing::get, Json, Router, extract::Query};
use serde::Deserialize;
use rspotify::ClientCredsSpotify;
use rspotify::model::{SearchType, SearchResult};
use rspotify::prelude::*;
use rspotify::AuthCodeSpotify;
use std::env;
use anyhow::Result; // Using anyhow for easier error handling

#[derive(Deserialize)]
pub struct AlbumSearchQuery {
    q: String, // The search query string
}

// Placeholder for now, will implement actual search logic
async fn search_albums(Query(params): Query<AlbumSearchQuery>) -> Result<Json<SearchResult>, String> {
    // TODO: Initialize Spotify client (ideally share via AppState)
    // TODO: Perform search using rspotify
    // TODO: Handle errors properly
    
    // Example placeholder response
    println!("Searching for albums with query: {}", params.q);
    // Replace with actual rspotify search call
    // For now, return an error or dummy data
    Err(format!("Spotify search not yet implemented for query: {}", params.q))
}

pub fn routes() -> Router<crate::app_state::AppState> {
    Router::new()
        .route("/albums/search", get(search_albums))
    // Add other Spotify related routes here if needed
}

// Helper function to initialize Spotify client (consider moving to AppState initialization)
// This example uses Client Credentials Flow - suitable for non-user-specific requests like search
async fn get_spotify_client() -> Result<ClientCredsSpotify> {
    use rspotify::Credentials;
    use rspotify::Config;

    // Load credentials from environment variables
    let creds = Credentials::from_env().ok_or_else(|| anyhow::anyhow!("Spotify credentials (RSPOTIFY_CLIENT_ID, RSPOTIFY_CLIENT_SECRET) not found in environment"))?;

    // Configure the client
    let config = Config {
        token_refreshing: true,
        ..Default::default()
    };

    // Create the client with client credentials flow
    let spotify = ClientCredsSpotify::with_config(creds, config);

    // Authenticate using client credentials
    spotify.request_token().await?; 
    
    Ok(spotify)
}
