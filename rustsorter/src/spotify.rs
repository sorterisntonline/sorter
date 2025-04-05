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

use crate::entity::Entity;

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
async fn ensure_spotify_entity(
    State(state): State<crate::app_state::AppState>,
    Json(payload): Json<EnsureEntityPayload>,
) -> Result<impl IntoResponse, SpotifyApiError> {
    log::info!(
        "Received ensure request for: {}/{}",
        payload.pk_namespace,
        payload.pk
    );

    // 1. Check if the namespace is valid for this handler
    if !payload.pk_namespace.starts_with("spotify:") {
        return Err(SpotifyApiError::BadRequest(format!(
            "Invalid namespace '{}' for Spotify ensure endpoint.",
            payload.pk_namespace
        )));
    }

    let spotify = &state.spotify_client; // Get a reference early

    // 2. Attempt Insert with ON CONFLICT DO NOTHING
    let insert_result = sqlx::query!(
        r#"
        INSERT INTO entities (pk_namespace, pk, title, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (pk_namespace, pk) DO NOTHING
        "#,
        payload.pk_namespace,
        payload.pk,
        payload.title, // Use title/metadata from payload for initial insert
        payload.metadata
    )
    .execute(&state.db)
    .await?;

    let was_inserted = insert_result.rows_affected() > 0;
    let status_code = if was_inserted {
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

    // 3. Fetch the entity (required whether inserted or pre-existing to return it)
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
    .fetch_one(&state.db)
    .await?;

    // 4. --- Conditional Fetching ---
    // Only fetch full details from Spotify and ensure related entities
    // if the entity was newly inserted in step 2.
    if was_inserted {
        log::info!(
            "Fetching full details from Spotify for new entity: {}/{}",
            payload.pk_namespace,
            payload.pk
        );
        match payload.pk_namespace.as_str() {
            "spotify:artist" => {
                let artist_id_str = &payload.pk;
                match ArtistId::from_id(artist_id_str) {
                    Ok(artist_id) => {
                        match spotify.artist(artist_id.clone()).await {
                            Ok(full_artist) => {
                                log::info!("Fetched full artist details for: {}", artist_id_str);
                                // Update the entity object we fetched earlier
                                entity.title = Some(full_artist.name.clone());
                                entity.metadata = Some(serde_json::to_value(&full_artist)?);

                                // Update the primary artist entity in DB
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
                                .execute(&state.db)
                                .await?;
                                log::info!(
                                    "Updated DB with full artist details for: {}",
                                    artist_id_str
                                );

                                // Fetch and ensure top 5 albums
                                log::info!("Fetching top 5 albums for artist: {}", artist_id_str);
                                let albums_result = spotify
                                    .artist_albums_manual(
                                        artist_id.clone(),
                                        vec![AlbumType::Album],
                                        Some(Market::Country(Country::UnitedStates)),
                                        Some(5), // Limit to 5
                                        None,
                                    )
                                    .await;

                                match albums_result {
                                    Ok(albums_page) => {
                                        for album in albums_page.items {
                                            // Clone the Option<AlbumId> first
                                            let album_id_opt = album.id.clone();

                                            // Check the cloned Option
                                            if let Some(album_id) = album_id_opt {
                                                let album_pk = album_id.id().to_string();
                                                let album_ns = "spotify:album".to_string();
                                                // Now clone name and serialize since ID exists
                                                let album_title = Some(album.name.clone());
                                                let album_meta =
                                                    Some(serde_json::to_value(&album)?);

                                                log::info!(
                                                    "Ensuring related album: {}/{}",
                                                    album_ns,
                                                    album_pk
                                                );
                                                sqlx::query!(
                                                    r#"
                                                    INSERT INTO entities (pk_namespace, pk, title, metadata)
                                                    VALUES ($1, $2, $3, $4)
                                                    ON CONFLICT (pk_namespace, pk) DO UPDATE
                                                    SET title = excluded.title, metadata = excluded.metadata
                                                    "#,
                                                    album_ns, album_pk, album_title, album_meta
                                                )
                                                .execute(&state.db)
                                                .await?;
                                            } else {
                                                log::warn!(
                                                    "Skipping album with missing ID for artist {}",
                                                    artist_id_str
                                                );
                                            }
                                        }
                                    }
                                    Err(e) => log::warn!(
                                        "Failed to fetch albums for artist {}: {}",
                                        artist_id_str,
                                        e
                                    ),
                                }
                            }
                            Err(e) => {
                                // Log error but potentially continue if primary entity exists
                                log::error!(
                                    "Failed to fetch full artist {} from Spotify: {}",
                                    artist_id_str,
                                    e
                                );
                                // Depending on requirements, you might want to return an error here
                                // or allow the partially updated entity to be returned.
                            }
                        }
                    }
                    Err(e) => log::error!(
                        "Invalid Spotify Artist ID format '{}': {}",
                        artist_id_str,
                        e
                    ), // Log and continue
                }
            }
            "spotify:album" => {
                let album_id_str = &payload.pk;
                match AlbumId::from_id(album_id_str) {
                    Ok(album_id) => {
                        match spotify
                            .album(
                                album_id.clone(),
                                Some(Market::Country(Country::UnitedStates)),
                            )
                            .await
                        {
                            Ok(full_album) => {
                                log::info!("Fetched full album details for: {}", album_id_str);
                                entity.title = Some(full_album.name.clone());
                                entity.metadata = Some(serde_json::to_value(&full_album)?);

                                // Update the primary album entity in DB
                                sqlx::query!(
                                    /* ... UPDATE query identical to artist case ... */
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
                                .execute(&state.db)
                                .await?;
                                log::info!(
                                    "Updated DB with full album details for: {}",
                                    album_id_str
                                );

                                // Fetch and ensure tracks (limit 50 for now)
                                log::info!("Ensuring tracks for album: {}", album_id_str);
                                for track in full_album.tracks.items {
                                    // SimplifiedTrack
                                    // Clone the Option<TrackId> first
                                    let track_id_opt = track.id.clone();
                                    // Clone artists list before checking track ID
                                    let track_artists_clone = track.artists.clone();

                                    // Check the cloned Option
                                    if let Some(track_id) = track_id_opt {
                                        let track_pk = track_id.id().to_string();
                                        let track_ns = "spotify:track".to_string();
                                        // Now clone name and serialize track since ID exists
                                        let track_title = Some(track.name.clone());
                                        let track_meta = Some(serde_json::to_value(&track)?);

                                        log::info!(
                                            "Ensuring related track: {}/{}",
                                            track_ns,
                                            track_pk
                                        );
                                        sqlx::query!(
                                            /* ... INSERT ON CONFLICT DO UPDATE ... */
                                            r#"
                                            INSERT INTO entities (pk_namespace, pk, title, metadata)
                                            VALUES ($1, $2, $3, $4)
                                            ON CONFLICT (pk_namespace, pk) DO UPDATE
                                            SET title = excluded.title, metadata = excluded.metadata
                                            "#,
                                            track_ns,
                                            track_pk,
                                            track_title,
                                            track_meta
                                        )
                                        .execute(&state.db)
                                        .await?;

                                        // Ensure artists for this track (SimplifiedArtist)
                                        // Use the cloned artists list
                                        for artist in track_artists_clone {
                                            // Clone the Option<ArtistId> first
                                            let artist_id_opt = artist.id.clone();

                                            // Check the cloned Option
                                            if let Some(artist_id) = artist_id_opt {
                                                let artist_pk = artist_id.id().to_string();
                                                let artist_ns = "spotify:artist".to_string();
                                                // Now clone name and serialize artist since ID exists
                                                let artist_title = Some(artist.name.clone());
                                                let artist_meta =
                                                    Some(serde_json::to_value(&artist)?);

                                                log::info!(
                                                    "Ensuring related artist from track: {}/{}",
                                                    artist_ns,
                                                    artist_pk
                                                );
                                                sqlx::query!(/* ... INSERT ON CONFLICT DO UPDATE ... */
                                                    r#"
                                                    INSERT INTO entities (pk_namespace, pk, title, metadata)
                                                    VALUES ($1, $2, $3, $4)
                                                    ON CONFLICT (pk_namespace, pk) DO UPDATE
                                                    SET title = excluded.title, metadata = excluded.metadata
                                                    "#,
                                                    artist_ns, artist_pk, artist_title, artist_meta
                                                )
                                                .execute(&state.db)
                                                .await?;
                                            } else {
                                                log::warn!(
                                                    "Skipping artist with missing ID for track {}",
                                                    track_pk
                                                );
                                            }
                                        }
                                    } else {
                                        log::warn!(
                                            "Skipping track with missing ID for album {}",
                                            album_id_str
                                        );
                                    }
                                }
                                // TODO: Handle paging for albums with > 50 tracks if necessary
                            }
                            Err(e) => log::error!(
                                "Failed to fetch full album {} from Spotify: {}",
                                album_id_str,
                                e
                            ),
                        }
                    }
                    Err(e) => {
                        log::error!("Invalid Spotify Album ID format '{}': {}", album_id_str, e)
                    }
                }
            }
            "spotify:track" => {
                let track_id_str = &payload.pk;
                match TrackId::from_id(track_id_str) {
                    Ok(track_id) => {
                        match spotify
                            .track(
                                track_id.clone(),
                                Some(Market::Country(Country::UnitedStates)),
                            )
                            .await
                        {
                            Ok(full_track) => {
                                log::info!("Fetched full track details for: {}", track_id_str);
                                entity.title = Some(full_track.name.clone());
                                entity.metadata = Some(serde_json::to_value(&full_track)?);

                                // Update the primary track entity in DB
                                sqlx::query!(
                                    /* ... UPDATE query identical to artist case ... */
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
                                .execute(&state.db)
                                .await?;
                                log::info!(
                                    "Updated DB with full track details for: {}",
                                    track_id_str
                                );

                                // Ensure artists for this track (SimplifiedArtist from FullTrack)
                                log::info!("Ensuring artists for track: {}", track_id_str);
                                // Clone the artists list first
                                let track_artists = full_track.artists.clone();
                                for artist in track_artists {
                                    // Clone the Option<ArtistId> first
                                    let artist_id_opt = artist.id.clone();

                                    // Check the cloned Option
                                    if let Some(artist_id) = artist_id_opt {
                                        let artist_pk = artist_id.id().to_string();
                                        let artist_ns = "spotify:artist".to_string();
                                        // Now clone name and serialize artist since ID exists
                                        let artist_title = Some(artist.name.clone());
                                        let artist_meta = Some(serde_json::to_value(&artist)?);

                                        log::info!(
                                            "Ensuring related artist: {}/{}",
                                            artist_ns,
                                            artist_pk
                                        );
                                        sqlx::query!(
                                            /* ... INSERT ON CONFLICT DO UPDATE ... */
                                            r#"
                                            INSERT INTO entities (pk_namespace, pk, title, metadata)
                                            VALUES ($1, $2, $3, $4)
                                            ON CONFLICT (pk_namespace, pk) DO UPDATE
                                            SET title = excluded.title, metadata = excluded.metadata
                                            "#,
                                            artist_ns,
                                            artist_pk,
                                            artist_title,
                                            artist_meta
                                        )
                                        .execute(&state.db)
                                        .await?;
                                    } else {
                                        log::warn!(
                                            "Skipping artist with missing ID for track {}",
                                            track_id_str
                                        );
                                    }
                                }

                                // Ensure the album for this track (SimplifiedAlbum from FullTrack)
                                log::info!("Ensuring album for track: {}", track_id_str);
                                // Check the Option<SimplifiedAlbum> first
                                let album = full_track.album;
                                // album is SimplifiedAlbum (moved from full_track)
                                // Clone the Option<AlbumId> from the album
                                let album_id_opt = album.id.clone();

                                // Check the cloned Option
                                if let Some(album_id) = album_id_opt {
                                    let album_pk = album_id.id().to_string();
                                    let album_ns = "spotify:album".to_string();
                                    // Now clone name and serialize album since ID exists
                                    let album_title = Some(album.name.clone());
                                    let album_meta = Some(serde_json::to_value(&album)?);

                                    log::info!("Ensuring related album: {}/{}", album_ns, album_pk);
                                    sqlx::query!(
                                        /* ... INSERT ON CONFLICT DO UPDATE ... */
                                        r#"
                                            INSERT INTO entities (pk_namespace, pk, title, metadata)
                                            VALUES ($1, $2, $3, $4)
                                            ON CONFLICT (pk_namespace, pk) DO UPDATE
                                            SET title = excluded.title, metadata = excluded.metadata
                                            "#,
                                        album_ns,
                                        album_pk,
                                        album_title,
                                        album_meta
                                    )
                                    .execute(&state.db)
                                    .await?;
                                } else {
                                    // album.id was None
                                    log::warn!("Album associated with track {} exists but is missing its own ID", track_id_str);
                                }
                            }
                            Err(e) => log::error!(
                                "Failed to fetch full track {} from Spotify: {}",
                                track_id_str,
                                e
                            ),
                        }
                    }
                    Err(e) => {
                        log::error!("Invalid Spotify Track ID format '{}': {}", track_id_str, e)
                    }
                }
            }
            _ => {
                // Should not happen due to the check at the start, but added for completeness
                log::warn!(
                    "Namespace {} was inserted but not handled for deep fetching",
                    payload.pk_namespace
                );
            }
        }
    } else {
        // Entity already existed, no Spotify fetching needed
        log::info!(
            "Skipping Spotify fetch for existing entity: {}/{}",
            payload.pk_namespace,
            payload.pk
        );
    }

    // 5. Return the primary entity (potentially updated if it was just inserted)
    Ok((status_code, Json(entity)))
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
