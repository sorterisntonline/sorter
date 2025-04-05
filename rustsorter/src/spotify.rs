use axum::{
    extract::{Query, State}, // Import State extractor
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post}, // Add post
    Json,
    Router,
};
use rspotify::{
    model::{
        AlbumId, AlbumType, ArtistId, Country, FullArtist, FullTrack, Id, Market, SearchType,
        SimplifiedAlbum, TrackId,
    },
    prelude::*, // Import necessary enums/structs
};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue; // For metadata

use crate::app_state::AppState; // Make sure AppState is imported
use crate::entity::Entity;
use sqlx::Executor; // Import Executor
use sqlx::PgPool; // Import PgPool
use sqlx::types::Uuid; // Import Uuid for the submitter_user_id

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
enum SpotifyApiError {
    SpotifySearchError(rspotify::ClientError),
    DatabaseError(sqlx::Error),
    SerializationError(serde_json::Error),
    BadRequest(String), // Added for invalid requests
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
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Database error: {}", e),
                )
            }
            SpotifyApiError::SerializationError(e) => {
                log::error!("Serialization error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Serialization error: {}", e),
                )
            }
            SpotifyApiError::BadRequest(msg) => {
                // Added case
                log::warn!("Bad request: {}", msg);
                (StatusCode::BAD_REQUEST, msg)
            }
            SpotifyApiError::InternalError(msg) => {
                log::error!("Internal search error: {}", msg);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    format!("Internal server error: {}", msg),
                )
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

// Map serde_json errors to our custom error type
impl From<serde_json::Error> for SpotifyApiError {
    fn from(err: serde_json::Error) -> Self {
        SpotifyApiError::SerializationError(err)
    }
}

// Helper function to insert or update an entity in the database
async fn upsert_entity<'e, E>(
    executor: E, // Changed parameter name and type
    pk_namespace: &str,
    pk: &str,
    title: Option<String>,
    metadata: Option<JsonValue>,
) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = sqlx::Postgres>, // Add trait bound
{
    log::debug!(
        "Upserting entity: {}/{} with title: {:?}",
        pk_namespace,
        pk,
        title
    );
    sqlx::query!(
        r#"
        INSERT INTO entities (pk_namespace, pk, title, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (pk_namespace, pk) DO UPDATE
        SET title = excluded.title, metadata = excluded.metadata
        "#,
        pk_namespace,
        pk,
        title,
        metadata
    )
    .execute(executor) // Use the executor
    .await?;
    Ok(())
}

// Helper function to insert an entity relationship, ignoring conflicts
async fn upsert_entity_relationship<'e, E>(
    executor: E, // Changed parameter name and type
    parent_pk_namespace: &str,
    parent_pk: &str,
    child_pk_namespace: &str,
    child_pk: &str,
    submitter_user_id: Option<Uuid>,
) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = sqlx::Postgres>, // Add trait bound
{
    log::debug!(
        "Upserting relationship: {}:{} -> {}:{}",
        parent_pk_namespace,
        parent_pk,
        child_pk_namespace,
        child_pk
    );
    sqlx::query!(
        r#"
        INSERT INTO entity_relationships (
            parent_pk_namespace, parent_pk,
            child_pk_namespace, child_pk,
            submitter_user_id
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk) DO NOTHING
        "#,
        parent_pk_namespace,
        parent_pk,
        child_pk_namespace,
        child_pk,
        submitter_user_id
    )
    .execute(executor) // Use the executor
    .await?;
    Ok(())
}

// search for dropdown suggestions
async fn search_spotify(
    State(app_state): State<crate::app_state::AppState>,
    Query(params): Query<AlbumSearchQuery>,
) -> Result<Json<SearchResult>, SpotifyApiError> {
    log::info!("Searching Spotify with query: {}", params.q);
    let spotify = &app_state.spotify_client;
    let search_result = spotify
        .search_multiple(
            &params.q,
            [SearchType::Album, SearchType::Artist, SearchType::Track],
            Some(Market::Country(Country::UnitedStates)),
            None,
            Some(10),
            None,
        )
        .await?;

    match (
        search_result.albums,
        search_result.artists,
        search_result.tracks,
    ) {
        (Some(albums), Some(artists), Some(tracks)) => Ok(Json(SearchResult {
            albums: albums.items,
            artists: artists.items,
            tracks: tracks.items,
        })),
        _ => Err(SpotifyApiError::InternalError(
            "Unexpected Spotify search result type".to_string(),
        )),
    }
}

// first called when a new entity is selected from the dropdown
// TODO make entity_relationship inserts
async fn ensure_spotify_entity(
    State(state): State<AppState>,
    Json(payload): Json<EnsureEntityPayload>,
) -> Result<impl IntoResponse, SpotifyApiError> {
    log::info!(
        "Received ensure request for: {}/{}",
        payload.pk_namespace,
        payload.pk
    );

    if !payload.pk_namespace.starts_with("spotify.") {
        return Err(SpotifyApiError::BadRequest(format!(
            "Invalid namespace '{}' for Spotify ensure endpoint.",
            payload.pk_namespace
        )));
    }

    let spotify = &state.spotify_client;
    let db_pool = &state.db;

    // Start transaction
    let mut tx = db_pool.begin().await?;

    // 1. Initial Insert Attempt (ON CONFLICT DO NOTHING)
    let insert_result = sqlx::query!(
        r#"
        INSERT INTO entities (pk_namespace, pk, title, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (pk_namespace, pk) DO NOTHING
        "#,
        payload.pk_namespace,
        payload.pk,
        payload.title,
        payload.metadata
    )
    .execute(&mut *tx)
    .await?;

    let was_inserted = insert_result.rows_affected() > 0;
    let initial_status_code = if was_inserted {
        log::info!("Entity inserted: {}/{}", payload.pk_namespace, payload.pk);
        StatusCode::CREATED
    } else {
        log::info!(
            "Entity already existed: {}/{}",
            payload.pk_namespace,
            payload.pk
        );
        StatusCode::OK
    };

    // 2. Fetch the entity record (always needed)
    let mut entity = sqlx::query_as!(
        Entity,
        r#"
        SELECT pk_namespace, pk, title, metadata, created_at
        FROM entities
        WHERE pk_namespace = $1 AND pk = $2
        "#,
        payload.pk_namespace,
        payload.pk
    )
    .fetch_one(&mut *tx)
    .await?;

    // 3. If it was newly inserted, fetch full details from Spotify and update/ensure related
    if was_inserted {
        log::info!(
            "Fetching full details from Spotify for new entity: {}/{}",
            payload.pk_namespace,
            payload.pk
        );

        match payload.pk_namespace.as_str() {
            "spotify.artist" => {
                let artist_id_str = &payload.pk;
                let artist_id = ArtistId::from_id(artist_id_str).map_err(|e| {
                    SpotifyApiError::BadRequest(format!("Invalid Spotify Artist ID: {}", e))
                })?;

                let full_artist = spotify.artist(artist_id.clone()).await?;
                log::info!("Fetched full artist details for: {}", artist_id_str);

                entity.title = Some(full_artist.name.clone());
                entity.metadata = Some(serde_json::to_value(&full_artist)?);

                sqlx::query!(
                    r#"
                    UPDATE entities
                    SET title = $1, metadata = $2
                    WHERE pk_namespace = $3 AND pk = $4
                    "#,
                    entity.title,
                    entity.metadata,
                    payload.pk_namespace,
                    payload.pk
                )
                .execute(&mut *tx)
                .await?;
                log::info!("Updated DB (in tx) with full artist details for: {}", artist_id_str);

                log::info!("Fetching top 5 albums for artist: {}", artist_id_str);
                let albums_page = spotify
                    .artist_albums_manual(
                        artist_id.clone(),
                        vec![AlbumType::Album],
                        Some(Market::Country(Country::UnitedStates)),
                        Some(5),
                        None,
                    )
                    .await?;

                for album in albums_page.items {
                    if let Some(album_id) = album.id.clone() {
                        let album_pk = album_id.id().to_string();
                        let album_ns = "spotify.album".to_string();
                        let album_title = Some(album.name.clone());
                        let album_meta = Some(serde_json::to_value(&album)?);

                        log::info!("Ensuring related album (in tx): {}/{}", album_ns, album_pk);
                        upsert_entity(&mut *tx, &album_ns, &album_pk, album_title, album_meta).await?;

                        // Add relationship: Artist -> Album
                        log::info!("Upserting relationship (in tx): {}/{} -> {}/{}", payload.pk_namespace, artist_id_str, album_ns, album_pk);
                        upsert_entity_relationship(
                            &mut *tx,
                            &payload.pk_namespace, // parent_ns (artist)
                            artist_id_str,        // parent_pk (artist)
                            &album_ns,            // child_ns (album)
                            &album_pk,            // child_pk (album)
                            None,                 // submitter_user_id
                        ).await?;

                    } else {
                        log::warn!("Skipping album with missing ID for artist {}", artist_id_str);
                    }
                }
            }
            "spotify.album" => {
                let album_id_str = &payload.pk;
                let album_id = AlbumId::from_id(album_id_str).map_err(|e| {
                    SpotifyApiError::BadRequest(format!("Invalid Spotify Album ID: {}", e))
                })?;

                let full_album = spotify.album(album_id.clone(), Some(Market::Country(Country::UnitedStates))).await?;
                log::info!("Fetched full album details for: {}", album_id_str);

                entity.title = Some(full_album.name.clone());
                entity.metadata = Some(serde_json::to_value(&full_album)?);

                sqlx::query!(
                    r#"
                    UPDATE entities
                    SET title = $1, metadata = $2
                    WHERE pk_namespace = $3 AND pk = $4
                    "#,
                    entity.title,
                    entity.metadata,
                    payload.pk_namespace,
                    payload.pk
                )
                .execute(&mut *tx)
                .await?;
                log::info!("Updated DB (in tx) with full album details for: {}", album_id_str);

                // Ensure Album's Artists and relationship Artist -> Album
                log::info!("Ensuring artists for album (in tx): {}", album_id_str);
                for artist in full_album.artists.iter() { // Use iter() instead of into_iter() if full_album is needed later
                    if let Some(artist_id) = artist.id.clone() {
                        let artist_pk = artist_id.id().to_string();
                        let artist_ns = "spotify.artist".to_string();
                        let artist_title = Some(artist.name.clone());
                        // Fetching full artist metadata here might be too much, use simplified
                        let artist_meta = Some(serde_json::to_value(artist)?);

                        log::info!("Ensuring related artist from album (in tx): {}/{}", artist_ns, artist_pk);
                        upsert_entity(&mut *tx, &artist_ns, &artist_pk, artist_title, artist_meta).await?;

                        // Add relationship: Artist -> Album
                        log::info!("Upserting relationship (in tx): {}/{} -> {}/{}", artist_ns, artist_pk, payload.pk_namespace, album_id_str);
                        upsert_entity_relationship(
                            &mut *tx,
                            &artist_ns,            // parent_ns (artist)
                            &artist_pk,            // parent_pk (artist)
                            &payload.pk_namespace, // child_ns (album)
                            album_id_str,        // child_pk (album)
                            None,                  // submitter_user_id
                        ).await?;
                    } else {
                         log::warn!("Skipping artist with missing ID for album {}", album_id_str);
                    }
                }

                log::info!("Ensuring tracks for album (in tx): {}", album_id_str);
                for track in full_album.tracks.items {
                    if let Some(track_id) = track.id.clone() {
                        let track_pk = track_id.id().to_string();
                        let track_ns = "spotify.track".to_string();
                        let track_title = Some(track.name.clone());
                        let track_meta = Some(serde_json::to_value(&track)?);

                        log::info!("Ensuring related track (in tx): {}/{}", track_ns, track_pk);
                        upsert_entity(&mut *tx, &track_ns, &track_pk, track_title, track_meta).await?;

                        // Add relationship: Album -> Track
                        log::info!("Upserting relationship (in tx): {}/{} -> {}/{}", payload.pk_namespace, album_id_str, track_ns, track_pk);
                        upsert_entity_relationship(
                            &mut *tx,
                            &payload.pk_namespace, // parent_ns (album)
                            album_id_str,        // parent_pk (album)
                            &track_ns,             // child_ns (track)
                            &track_pk,             // child_pk (track)
                            None,                  // submitter_user_id
                        ).await?;

                        for artist in track.artists {
                            if let Some(artist_id) = artist.id.clone() {
                                let artist_pk = artist_id.id().to_string();
                                let artist_ns = "spotify.artist".to_string();
                                let artist_title = Some(artist.name.clone());
                                let artist_meta = Some(serde_json::to_value(&artist)?);

                                log::info!("Ensuring related artist from track (in tx): {}/{}", artist_ns, artist_pk);
                                upsert_entity(&mut *tx, &artist_ns, &artist_pk, artist_title, artist_meta).await?;

                                // Add relationship: Artist -> Track
                                log::info!("Upserting relationship (in tx): {}/{} -> {}/{}", artist_ns, artist_pk, track_ns, track_pk);
                                upsert_entity_relationship(
                                    &mut *tx,
                                    &artist_ns, // parent_ns (artist)
                                    &artist_pk, // parent_pk (artist)
                                    &track_ns,  // child_ns (track)
                                    &track_pk,  // child_pk (track)
                                    None,       // submitter_user_id
                                ).await?;

                            } else {
                                log::warn!("Skipping artist with missing ID for track {}", track_pk);
                            }
                        }
                    } else {
                        log::warn!("Skipping track with missing ID for album {}", album_id_str);
                    }
                }
            }
            "spotify.track" => {
                let track_id_str = &payload.pk;
                let track_id = TrackId::from_id(track_id_str).map_err(|e| {
                    SpotifyApiError::BadRequest(format!("Invalid Spotify Track ID: {}", e))
                })?;

                let full_track = spotify.track(track_id.clone(), Some(Market::Country(Country::UnitedStates))).await?;
                log::info!("Fetched full track details for: {}", track_id_str);

                entity.title = Some(full_track.name.clone());
                entity.metadata = Some(serde_json::to_value(&full_track)?);

                sqlx::query!(
                    r#"
                    UPDATE entities
                    SET title = $1, metadata = $2
                    WHERE pk_namespace = $3 AND pk = $4
                    "#,
                    entity.title,
                    entity.metadata,
                    payload.pk_namespace,
                    payload.pk
                )
                .execute(&mut *tx)
                .await?;
                log::info!("Updated DB (in tx) with full track details for: {}", track_id_str);

                log::info!("Ensuring artists for track (in tx): {}", track_id_str);
                for artist in full_track.artists.iter() { // Use iter()
                    if let Some(artist_id) = artist.id.clone() {
                        let artist_pk = artist_id.id().to_string();
                        let artist_ns = "spotify.artist".to_string();
                        let artist_title = Some(artist.name.clone());
                        // Use simplified artist metadata from track object
                        let artist_meta = Some(serde_json::to_value(artist)?);

                        log::info!("Ensuring related artist (in tx): {}/{}", artist_ns, artist_pk);
                        upsert_entity(&mut *tx, &artist_ns, &artist_pk, artist_title, artist_meta).await?;

                        // Add relationship: Artist -> Track
                        log::info!("Upserting relationship (in tx): {}/{} -> {}/{}", artist_ns, artist_pk, payload.pk_namespace, track_id_str);
                         upsert_entity_relationship(
                            &mut *tx,
                            &artist_ns,             // parent_ns (artist)
                            &artist_pk,             // parent_pk (artist)
                            &payload.pk_namespace,  // child_ns (track)
                            track_id_str,         // child_pk (track)
                            None,                   // submitter_user_id
                        ).await?;

                    } else {
                        log::warn!("Skipping artist with missing ID for track {}", track_id_str);
                    }
                }

                log::info!("Ensuring album for track (in tx): {}", track_id_str);
                let album = full_track.album; // No need for clone if we consume it here
                if let Some(album_id) = album.id.clone() {
                    let album_pk = album_id.id().to_string();
                    let album_ns = "spotify.album".to_string();
                    let album_title = Some(album.name.clone());
                    let album_meta = Some(serde_json::to_value(&album)?);

                    log::info!("Ensuring related album (in tx): {}/{}", album_ns, album_pk);
                    upsert_entity(&mut *tx, &album_ns, &album_pk, album_title, album_meta).await?;

                    // Add relationship: Album -> Track
                    log::info!("Upserting relationship (in tx): {}/{} -> {}/{}", album_ns, album_pk, payload.pk_namespace, track_id_str);
                    upsert_entity_relationship(
                        &mut *tx,
                        &album_ns,             // parent_ns (album)
                        &album_pk,             // parent_pk (album)
                        &payload.pk_namespace, // child_ns (track)
                        track_id_str,        // child_pk (track)
                        None,                  // submitter_user_id
                    ).await?;

                } else {
                    log::warn!("Album associated with track {} exists but is missing its own ID", track_id_str);
                }
            }
            _ => {
                log::warn!(
                    "Namespace {} was inserted but not handled for deep fetching",
                    payload.pk_namespace
                );
            }
        }
    } else {
        log::info!(
            "Skipping Spotify fetch for existing entity: {}/{}",
            payload.pk_namespace,
            payload.pk
        );
    }

    tx.commit().await?;

    Ok((initial_status_code, Json(entity)))
}

// Updated routes function
pub fn routes() -> Router<crate::app_state::AppState> {
    Router::new()
        .route("/search", get(search_spotify))
        .route("/ensure", post(ensure_spotify_entity)) // Add the new route
                                                       // Add other Spotify related routes here if needed
}

// Remove the standalone get_spotify_client() function from this file
// async fn get_spotify_client() -> Result<ClientCredsSpotify> { ... }
