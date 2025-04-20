use anyhow::Context;
use axum::{
    Json,
    Router,
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use log::{info, warn};
use rspotify::{
    model::{
        AlbumId,
        AlbumType,
        ArtistId,
        Country,
        FullArtist,
        FullTrack,
        Id,
        IdError,
        Image,
        Market,
        SearchType,
        SimplifiedAlbum,
        TrackId,
    },
    prelude::*,
};
use rustsorter::models::IntoNotFound;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{Executor, types::Uuid};

use crate::{
    app_state::AppState,
    entity::Entity,
    models::{Error, MapError, MapErrorSqlx},
};

#[derive(Deserialize)]
pub struct AlbumSearchQuery {
    q: String,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub albums: Vec<SimplifiedAlbum>,
    pub artists: Vec<FullArtist>,
    pub tracks: Vec<FullTrack>,
}

#[derive(Deserialize, Debug)]
pub struct EnsureEntityPayload {
    pk_namespace: String,
    pk: String,
    title: Option<String>,
    metadata: Option<JsonValue>,
}

impl From<IdError> for Error {
    fn from(e: IdError) -> Self {
        Error::BadRequest {
            message: format!("invalid Spotify ID: {}", e).into(),
        }
    }
}

fn get_first_image_url(images: &[Image]) -> Option<String> {
    images.first().map(|img| img.url.clone())
}

async fn upsert_entity<'e, E>(
    executor: E,
    pk_namespace: &str,
    pk: &str,
    title: Option<String>,
    profile_picture_url: Option<String>,
    metadata: Option<JsonValue>,
) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = sqlx::Postgres>,
{
    log::debug!(
        "Upserting entity (DO NOTHING): {}/{} with title: {:?}, pic_url: {:?}",
        pk_namespace,
        pk,
        title,
        profile_picture_url
    );
    sqlx::query!(
        r#"
        INSERT INTO entities (pk_namespace, pk, title, profile_picture_url, metadata)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (pk_namespace, pk) DO NOTHING
        "#,
        pk_namespace,
        pk,
        title,
        profile_picture_url,
        metadata
    )
    .execute(executor)
    .await?;
    Ok(())
}

async fn upsert_entity_relationship<'e, E>(
    executor: E,
    parent_pk_namespace: &str,
    parent_pk: &str,
    child_pk_namespace: &str,
    child_pk: &str,
    submitter_user_id: Option<Uuid>,
) -> Result<(), sqlx::Error>
where
    E: Executor<'e, Database = sqlx::Postgres>,
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
    .execute(executor)
    .await?;
    Ok(())
}

async fn search_spotify(
    State(app_state): State<crate::app_state::AppState>,
    Query(params): Query<AlbumSearchQuery>,
) -> Result<Json<SearchResult>, Error> {
    info!("Searching Spotify with query: {}", params.q);
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
        .await
        .map_internal()?;

    let none_message = "Unexpected Spotify search result type";
    let ((albums, artists), tracks) = search_result
        .albums
        .zip(search_result.artists)
        .zip(search_result.tracks)
        .context(none_message)?;

    Ok(Json(SearchResult {
        albums: albums.items,
        artists: artists.items,
        tracks: tracks.items,
    }))
}

// TODO make entity_relationship inserts
// TODO PLEASE make this function DRY and not 500 lines
async fn ensure_spotify_entity(
    State(state): State<AppState>,
    Json(payload): Json<EnsureEntityPayload>,
) -> Result<impl IntoResponse, Error> {
    info!(
        namespace = payload.pk_namespace,
        pk = payload.pk;
        "received ensure request",
    );

    if !payload.pk_namespace.starts_with("spotify.") {
        return Err(Error::BadRequest {
            message: format!(
                "invalid namespace '{}' for Spotify ensure endpoint.",
                payload.pk_namespace
            )
            .into(),
        });
    }

    let spotify = &state.spotify_client;
    let db_pool = &state.db;

    let mut tx = db_pool.begin().await.map_error("spotify entity")?;

    let insert_result = sqlx::query!(
        r#"
        INSERT INTO entities (pk_namespace, pk, title, profile_picture_url, metadata)
        VALUES ($1, $2, $3, NULL, $4)
        ON CONFLICT (pk_namespace, pk) DO NOTHING
        "#,
        payload.pk_namespace,
        payload.pk,
        payload.title,
        payload.metadata
    )
    .execute(&mut *tx)
    .await
    .map_error("entity")?;

    let initial_status_code = if insert_result.catch_not_found("entity").is_ok() {
        info!(
            namespace = payload.pk_namespace,
            pk = payload.pk;
            "entity inserted",
        );
        StatusCode::CREATED
    } else {
        info!(
            namespace = payload.pk_namespace,
            pk = payload.pk;
            "entity already existed",
        );
        StatusCode::OK
    };

    let mut entity = sqlx::query_as!(
        Entity,
        r#"
        SELECT pk_namespace, pk, title, profile_picture_url, metadata, created_at
        FROM entities
        WHERE pk_namespace = $1 AND pk = $2
        "#,
        payload.pk_namespace,
        payload.pk
    )
    .fetch_one(&mut *tx)
    .await
    .map_error("entity")?;

    info!(
        namespace = payload.pk_namespace,
        pk = payload.pk;
        "fetching full details from Spotify for new entity",
    );

    match payload.pk_namespace.as_str() {
        "spotify.artist" => {
            let artist_id_str = &payload.pk;
            let artist_id = ArtistId::from_id(artist_id_str)?;

            let full_artist = spotify.artist(artist_id.clone()).await.map_internal()?;
            info!(
                namespace = payload.pk_namespace,
                pk = payload.pk;
                "fetched full artist details",
            );

            entity.title = Some(full_artist.name.clone());
            entity.profile_picture_url = get_first_image_url(&full_artist.images);
            entity.metadata = Some(serde_json::to_value(&full_artist).map_internal()?);

            sqlx::query!(
                r#"
                    UPDATE entities
                    SET title = $1, profile_picture_url = $2, metadata = $3
                    WHERE pk_namespace = $4 AND pk = $5
                    "#,
                entity.title,
                entity.profile_picture_url,
                entity.metadata,
                payload.pk_namespace,
                payload.pk
            )
            .execute(&mut *tx)
            .await
            .map_error("entity")?;
            info!(
                namespace = payload.pk_namespace,
                pk = payload.pk;
                "updated DB (in tx) with full artist details",
            );

            info!(
                namespace = payload.pk_namespace,
                pk = payload.pk;
                "fetching top 5 albums for artist",
            );
            let albums_page = spotify
                .artist_albums_manual(
                    artist_id.clone(),
                    vec![AlbumType::Album],
                    Some(Market::Country(Country::UnitedStates)),
                    Some(5),
                    None,
                )
                .await
                .map_internal()?;

            for album in albums_page.items {
                let Some(album_id) = album.id.clone() else {
                    warn!(artist_id_str; "skipping album with missing ID for artist");
                    continue;
                };

                let album_pk = album_id.id().to_string();
                let album_ns = "spotify.album".to_string();
                let album_title = Some(album.name.clone());
                let album_pic_url = get_first_image_url(&album.images);
                let album_meta = Some(serde_json::to_value(&album).map_internal()?);

                info!(
                    album_ns, album_pk, artist_id_str;
                    "ensuring related album (in tx)",
                );
                upsert_entity(
                    &mut *tx,
                    &album_ns,
                    &album_pk,
                    album_title,
                    album_pic_url,
                    album_meta,
                )
                .await
                .map_error("entity")?;

                info!(
                    pk_namespace = payload.pk_namespace,
                    album_ns,
                    album_pk,
                    artist_id_str;
                    "upserting relationship (in tx)",
                );
                upsert_entity_relationship(
                    &mut *tx,
                    &payload.pk_namespace,
                    artist_id_str,
                    &album_ns,
                    &album_pk,
                    None,
                )
                .await
                .map_error("entity relationship")?;
            }
        }
        "spotify.album" => {
            let album_id_str = &payload.pk;
            let album_id = AlbumId::from_id(album_id_str)?;

            let full_album = spotify
                .album(
                    album_id.clone(),
                    Some(Market::Country(Country::UnitedStates)),
                )
                .await
                .map_internal()?;
            info!(
                album_id_str;
                "fetched full album details",
            );

            entity.title = Some(full_album.name.clone());
            entity.profile_picture_url = get_first_image_url(&full_album.images);
            entity.metadata = Some(serde_json::to_value(&full_album).map_internal()?);

            sqlx::query!(
                r#"
                    UPDATE entities
                    SET title = $1, profile_picture_url = $2, metadata = $3
                    WHERE pk_namespace = $4 AND pk = $5
                    "#,
                entity.title,
                entity.profile_picture_url,
                entity.metadata,
                payload.pk_namespace,
                payload.pk
            )
            .execute(&mut *tx)
            .await
            .map_error("entity")?;
            info!(
                album_id_str;
                "updated DB (in tx) with full album details",
            );

            info!(
                album_id_str;
                "ensuring artists for album (in tx)",
            );
            for artist in full_album.artists.iter() {
                let Some(artist_id) = artist.id.clone() else {
                    warn!(album_id_str; "skipping artist with missing ID for album");
                    continue;
                };

                let artist_pk = artist_id.id().to_string();
                let artist_ns = "spotify.artist".to_string();
                let artist_title = Some(artist.name.clone());

                let artist_pic_url = None::<String>;
                let artist_meta = Some(serde_json::to_value(artist).map_internal()?);

                info!(
                    artist_ns, artist_pk;
                    "ensuring related artist from album (in tx)",
                );
                upsert_entity(
                    &mut *tx,
                    &artist_ns,
                    &artist_pk,
                    artist_title,
                    artist_pic_url,
                    artist_meta,
                )
                .await
                .map_error("entity")?;

                info!(
                    pk_namespace = payload.pk_namespace, artist_ns, artist_pk, album_id_str;
                    "upserting relationship (in tx)",
                );
                upsert_entity_relationship(
                    &mut *tx,
                    &artist_ns,
                    &artist_pk,
                    &payload.pk_namespace,
                    album_id_str,
                    None,
                )
                .await
                .map_error("entity relationship")?;
            }

            info!(
                album_id_str;
                "ensuring tracks for album (in tx)",
            );
            for track in full_album.tracks.items {
                let Some(track_id) = track.id.clone() else {
                    warn!(album_id_str; "skipping track with missing ID for album");
                    continue;
                };

                let track_pk = track_id.id().to_string();
                let track_ns = "spotify.track".to_string();
                let track_title = Some(track.name.clone());

                let track_pic_url = entity.profile_picture_url.clone();
                let track_meta = Some(serde_json::to_value(&track).map_internal()?);

                info!(
                    track_ns, track_pk;
                    "ensuring related track (in tx)",
                );
                upsert_entity(
                    &mut *tx,
                    &track_ns,
                    &track_pk,
                    track_title,
                    track_pic_url,
                    track_meta,
                )
                .await
                .map_error("entity")?;

                info!(
                    pk_namespace = payload.pk_namespace,
                    track_ns,
                    track_pk,
                    album_id_str;
                    "upserting relationship (in tx)",
                );
                upsert_entity_relationship(
                    &mut *tx,
                    &payload.pk_namespace,
                    album_id_str,
                    &track_ns,
                    &track_pk,
                    None,
                )
                .await
                .map_error("entity relationship")?;

                for artist in track.artists {
                    let Some(artist_id) = artist.id.clone() else {
                        warn!(album_id_str; "skipping artist with missing ID for track");
                        continue;
                    };

                    let artist_pk = artist_id.id().to_string();
                    let artist_ns = "spotify.artist".to_string();
                    let artist_title = Some(artist.name.clone());
                    let artist_pic_url = None::<String>;
                    let artist_meta = Some(serde_json::to_value(&artist).map_internal()?);

                    info!(
                        artist_ns, artist_pk;
                        "ensuring related artist from track (in tx)",
                    );
                    upsert_entity(
                        &mut *tx,
                        &artist_ns,
                        &artist_pk,
                        artist_title,
                        artist_pic_url,
                        artist_meta,
                    )
                    .await
                    .map_error("entity")?;

                    info!(
                        artist_ns, artist_pk, track_ns, track_pk;
                        "upserting relationship (in tx)",
                    );
                    upsert_entity_relationship(
                        &mut *tx, &artist_ns, &artist_pk, &track_ns, &track_pk, None,
                    )
                    .await
                    .map_error("entity relationship")?;
                }
            }
        }
        "spotify.track" => {
            let track_id_str = &payload.pk;
            let track_id = TrackId::from_id(track_id_str)?;

            let full_track = spotify
                .track(
                    track_id.clone(),
                    Some(Market::Country(Country::UnitedStates)),
                )
                .await
                .map_internal()?;
            info!(
                track_id_str;
                "fetched full track details",
            );

            entity.title = Some(full_track.name.clone());
            entity.profile_picture_url = get_first_image_url(&full_track.album.images);
            entity.metadata = Some(serde_json::to_value(&full_track).map_internal()?);
            println!(
                "entity.profile_picture_url: {:?}",
                entity.profile_picture_url
            );

            sqlx::query!(
                r#"
                    UPDATE entities
                    SET title = $1, metadata = $2, profile_picture_url = $3
                    WHERE pk_namespace = $4 AND pk = $5
                    "#,
                entity.title,
                entity.metadata,
                entity.profile_picture_url,
                payload.pk_namespace,
                payload.pk
            )
            .execute(&mut *tx)
            .await
            .map_error("entity")?;
            info!(
                track_id_str;
                "updated DB (in tx) with full track details",
            );

            info!(
                track_id_str;
                "ensuring artists for track (in tx)",
            );
            for artist in full_track.artists.iter() {
                let Some(artist_id) = artist.id.clone() else {
                    warn!(track_id_str; "skipping artist with missing ID for track");
                    continue;
                };

                let artist_pk = artist_id.id().to_string();
                let artist_ns = "spotify.artist".to_string();
                let artist_title = Some(artist.name.clone());
                let artist_pic_url = None::<String>;
                let artist_meta = Some(serde_json::to_value(artist).map_internal()?);

                info!(
                    artist_ns, artist_pk;
                    "ensuring related artist (in tx)",
                );
                upsert_entity(
                    &mut *tx,
                    &artist_ns,
                    &artist_pk,
                    artist_title,
                    artist_pic_url,
                    artist_meta,
                )
                .await
                .map_error("entity")?;

                info!(
                    pk_namespace = payload.pk_namespace, artist_ns, artist_pk, track_id_str;
                    "upserting relationship (in tx)",
                );
                upsert_entity_relationship(
                    &mut *tx,
                    &artist_ns,
                    &artist_pk,
                    &payload.pk_namespace,
                    track_id_str,
                    None,
                )
                .await
                .map_error("entity relationship")?;
            }

            info!(
                track_id_str;
                "ensuring album for track (in tx)",
            );

            let album = full_track.album.clone();
            if let Some(album_id) = album.id.clone() {
                let album_pk = album_id.id().to_string();
                let album_ns = "spotify.album".to_string();
                let album_title = Some(album.name.clone());
                let album_pic_url = get_first_image_url(&album.images);
                let album_meta = Some(serde_json::to_value(&album).map_internal()?);

                info!(
                    album_ns, album_pk;
                    "ensuring related album (in tx)",
                );
                upsert_entity(
                    &mut *tx,
                    &album_ns,
                    &album_pk,
                    album_title,
                    album_pic_url,
                    album_meta,
                )
                .await
                .map_error("entity")?;

                info!(
                    pk_namespace = payload.pk_namespace,
                    album_ns,
                    album_pk,
                    track_id_str;
                    "upserting relationship (in tx)",
                );
                upsert_entity_relationship(
                    &mut *tx,
                    &album_ns,
                    &album_pk,
                    &payload.pk_namespace,
                    track_id_str,
                    None,
                )
                .await
                .map_error("entity relationship")?;
            } else {
                warn!(
                    track_id_str;
                    "skipping album with missing ID for track",
                );
            }
        }
        _ => {
            warn!(
                pk_namespace = payload.pk_namespace;
                "namespace was inserted but not handled for deep fetching",
            );
        }
    }

    tx.commit().await.map_error("spotify entity")?;

    Ok((initial_status_code, Json(entity)))
}

pub fn routes() -> Router<crate::app_state::AppState> {
    Router::new()
        .route("/search", get(search_spotify))
        .route("/ensure", post(ensure_spotify_entity))
}
