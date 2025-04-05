use axum::{
    extract::{Query, State}, // Import State extractor
    routing::{get, post}, // Add post
    Json, Router, response::{IntoResponse, Response}, http::StatusCode,
};
use rspotify::{
    model::{Country, SimplifiedAlbum, FullArtist, FullTrack, Market, SearchType}, prelude::* // Import necessary enums/structs
};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue; // For metadata

// Import Entity struct from entity module
use crate::entity::Entity;
// Import ErrorResponse for consistent error handling if desired, or use custom error type
use crate::models::ErrorResponse;

// Remove unused imports if get_spotify_client is no longer here
// use rspotify::ClientCredsSpotify;
// use rspotify::AuthCodeSpotify;
// use std::env;
// use anyhow::Result;

// Keep the query struct for search
#[derive(Deserialize)]
pub struct AlbumSearchQuery {
    q: String, // The search query string
}

// Keep the search result struct
#[derive(Serialize)]
pub struct SearchResult {
    pub albums: Vec<SimplifiedAlbum>,
    pub artists: Vec<FullArtist>,
    pub tracks: Vec<FullTrack>,
}

// Define payload for the /ensure endpoint
#[derive(Deserialize, Debug)]
pub struct EnsureEntityPayload {
    pk_namespace: String,
    pk: String,
    title: Option<String>,
    metadata: Option<JsonValue>, // Allow arbitrary JSON metadata
}

// Define a custom error type for the handler
// (Keep existing SpotifySearchError and potentially add variants or another error type for ensure)
enum SpotifyApiError {
    SpotifySearchError(rspotify::ClientError),
    DatabaseError(sqlx::Error),
    InternalError(String),
}

// Implement IntoResponse for the custom error
impl IntoResponse for SpotifyApiError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            SpotifyApiError::SpotifySearchError(e) => {
                log::error!("Spotify API error: {}", e);
                (StatusCode::BAD_GATEWAY, format!("Spotify API error: {}", e))
            }
             SpotifyApiError::DatabaseError(e) => {
                 log::error!("Database error: {}", e);
                 (StatusCode::INTERNAL_SERVER_ERROR, format!("Database error: {}", e))
             }
            SpotifyApiError::InternalError(msg) => {
                 log::error!("Internal search error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, format!("Internal server error: {}", msg))
            }
        };
        (status, Json(serde_json::json!({ "error": error_message }))).into_response()
    }
}

// Map rspotify errors to our custom error type
impl From<rspotify::ClientError> for SpotifyApiError {
    fn from(err: rspotify::ClientError) -> Self {
        SpotifyApiError::SpotifySearchError(err)
    }
}

// Map sqlx errors to our custom error type
impl From<sqlx::Error> for SpotifyApiError {
    fn from(err: sqlx::Error) -> Self {
        SpotifyApiError::DatabaseError(err)
    }
}

// Updated search_albums handler (updated return type)
async fn search_albums(
    State(app_state): State<crate::app_state::AppState>,
    Query(params): Query<AlbumSearchQuery>,
) -> Result<Json<SearchResult>, SpotifyApiError>
{
    log::info!("Searching Spotify with query: {}", params.q);
    let spotify = &app_state.spotify_client;
    let search_result = spotify.search_multiple(
        &params.q,
        [SearchType::Album, SearchType::Artist, SearchType::Track],
        Some(Market::Country(Country::UnitedStates)),
        None,
        Some(10),
        None,
    ).await?;

    match (search_result.albums, search_result.artists, search_result.tracks) {
        (Some(albums), Some(artists), Some(tracks)) => {
             Ok(Json(SearchResult { albums: albums.items, artists: artists.items, tracks: tracks.items }))
        }
        _ => {
             Err(SpotifyApiError::InternalError("Unexpected Spotify search result type".to_string()))
        }
    }
}

// --- NEW: Handler for POST /spotify/ensure ---
async fn ensure_spotify_entity(
    State(state): State<crate::app_state::AppState>,
    Json(payload): Json<EnsureEntityPayload>,
) -> Result<impl IntoResponse, SpotifyApiError> {
    log::info!("Ensuring entity exists: {}/{}", payload.pk_namespace, payload.pk);

    // 1. Attempt Insert with ON CONFLICT DO NOTHING
    let insert_result = sqlx::query!(
        r#"
        INSERT INTO entities (pk_namespace, pk, title, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (pk_namespace, pk) DO NOTHING
        "#,
        payload.pk_namespace,
        payload.pk,
        payload.title,
        payload.metadata // Ensure metadata is passed as JsonValue
    )
    .execute(&state.db)
    .await?; // Propagate SQLx errors, converting them via From

    let entity: Entity;
    let status_code: StatusCode;

    if insert_result.rows_affected() > 0 {
        // 2a. Insert happened, fetch the newly created entity (must exist now)
        log::info!("Entity inserted: {}/{}", payload.pk_namespace, payload.pk);
        entity = sqlx::query_as!(
            Entity,
            r#"
            SELECT pk_namespace, pk, title, metadata, created_at
            FROM entities
            WHERE pk_namespace = $1 AND pk = $2
            "#,
            payload.pk_namespace,
            payload.pk
        )
        .fetch_one(&state.db) // Use fetch_one as it must exist
        .await?; // Propagate SQLx errors
        status_code = StatusCode::CREATED;
    } else {
        // 2b. Insert was skipped (conflict), fetch the existing entity
        log::info!("Entity already existed: {}/{}", payload.pk_namespace, payload.pk);
        entity = sqlx::query_as!(
             Entity,
             r#"
             SELECT pk_namespace, pk, title, metadata, created_at
             FROM entities
             WHERE pk_namespace = $1 AND pk = $2
             "#,
             payload.pk_namespace,
             payload.pk
         )
         .fetch_optional(&state.db) // Use fetch_optional just in case, though it should exist
         .await? // Propagate SQLx errors
         .ok_or_else(|| SpotifyApiError::InternalError(format!("Failed to fetch existing entity after conflict: {}/{}", payload.pk_namespace, payload.pk)))?; // Handle unlikely case where it's gone
        status_code = StatusCode::OK;
    }

    // 3. Return the entity (either new or existing)
    Ok((status_code, Json(entity)))
}

// Updated routes function
pub fn routes() -> Router<crate::app_state::AppState> {
    Router::new()
        .route("/search", get(search_albums))
        .route("/ensure", post(ensure_spotify_entity)) // Add the new route
    // Add other Spotify related routes here if needed
}

// Remove the standalone get_spotify_client() function from this file
// async fn get_spotify_client() -> Result<ClientCredsSpotify> { ... }
