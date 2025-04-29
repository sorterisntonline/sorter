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
    ClientCredsSpotify,
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
        SimplifiedArtist,
        SimplifiedTrack,
        TrackId,
    },
    prelude::*,
};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::types::Uuid;

use crate::{
    app_state::AppState,
    entity::{Entity, create_entity_ignore_conflict, get_entity},
    entity_relationships::{CreateRelationshipPayload, create_relationship_ignore_conflict},
    models::{Error, MapErrorAnyhow, MapErrorSqlx},
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

async fn search_spotify(
    State(app_state): State<crate::app_state::AppState>,
    Query(params): Query<AlbumSearchQuery>,
) -> Result<Json<SearchResult>, Error> {
    info!(
        query = params.q;
        "searching Spotify",
    );
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

    let ((albums, artists), tracks) = search_result
        .albums
        .zip(search_result.artists)
        .zip(search_result.tracks)
        .context("Unexpected Spotify search result type")?;

    Ok(Json(SearchResult {
        albums: albums.items,
        artists: artists.items,
        tracks: tracks.items,
    }))
}

async fn push_artist(
    entities: &mut Vec<(Entity, Option<CreateRelationshipPayload>)>,
    spotify: &ClientCredsSpotify,
    user_id: Uuid,
) -> Result<(), Error> {
    let artist_id = ArtistId::from_id(entities[0].0.pk.clone())?;

    let full_artist = spotify.artist(artist_id.clone()).await.map_internal()?;
    info!(
        namespace = &entities[0].0.pk_namespace,
        pk = &entities[0].0.pk;
        "fetched full artist details",
    );

    entities[0].0.title = Some(full_artist.name.clone());
    entities[0].0.metadata = Some(serde_json::to_value(&full_artist).map_internal()?);
    entities[0].0.profile_picture_url = get_first_image_url(&full_artist.images);

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
        push_simplified_album(entities, user_id, album, entities[0].0.clone())?;
    }

    Ok(())
}

fn push_simplified_artist(
    entities: &mut Vec<(Entity, Option<CreateRelationshipPayload>)>,
    user_id: Uuid,
    artist: SimplifiedArtist,
    album: Entity,
) -> Result<(), Error> {
    let Some(artist_id) = artist.id.clone() else {
        warn!("skipping artist with missing ID");
        return Ok(());
    };

    let artist_entity = Entity {
        user_id,
        pk_namespace: "spotify.artist".to_string(),
        pk: artist_id.id().to_string(),
        title: Some(artist.name.clone()),
        profile_picture_url: None,
        metadata: Some(serde_json::to_value(artist).map_internal()?),
        created_at: None,
    };

    let relationship = CreateRelationshipPayload {
        parent_pk_namespace: artist_entity.pk_namespace.clone(),
        parent_pk: artist_entity.pk.clone(),
        child_pk_namespace: album.pk_namespace,
        child_pk: album.pk,
    };

    entities.push((artist_entity, Some(relationship)));

    Ok(())
}

async fn push_album(
    entities: &mut Vec<(Entity, Option<CreateRelationshipPayload>)>,
    spotify: &ClientCredsSpotify,
    user_id: Uuid,
) -> Result<(), Error> {
    let album_id = AlbumId::from_id(entities[0].0.pk.clone())?;

    let full_album = spotify
        .album(
            album_id.clone(),
            Some(Market::Country(Country::UnitedStates)),
        )
        .await
        .map_internal()?;
    info!(
        album_id = album_id.id();
        "fetched full album details",
    );

    entities[0].0.title = Some(full_album.name.clone());
    entities[0].0.metadata = Some(serde_json::to_value(&full_album).map_internal()?);
    entities[0].0.profile_picture_url = get_first_image_url(&full_album.images);

    for artist in full_album.artists {
        push_simplified_artist(entities, user_id, artist, entities[0].0.clone())?;
    }

    for track in full_album.tracks.items {
        push_simplified_track(entities, user_id, track, entities[0].0.clone())?;
    }

    Ok(())
}

fn push_simplified_album(
    entities: &mut Vec<(Entity, Option<CreateRelationshipPayload>)>,
    user_id: Uuid,
    album: SimplifiedAlbum,
    artist: Entity,
) -> Result<(), Error> {
    let Some(album_id) = album.id.clone() else {
        warn!("skipping album with missing ID");
        return Ok(());
    };

    let album_entity = Entity {
        user_id,
        pk_namespace: "spotify.album".to_string(),
        pk: album_id.id().to_string(),
        title: Some(album.name.clone()),
        profile_picture_url: get_first_image_url(&album.images),
        metadata: Some(serde_json::to_value(&album).map_internal()?),
        created_at: None,
    };

    let relationship = CreateRelationshipPayload {
        parent_pk_namespace: artist.pk_namespace,
        parent_pk: artist.pk,
        child_pk_namespace: album_entity.pk_namespace.clone(),
        child_pk: album_entity.pk.clone(),
    };

    entities.push((album_entity, Some(relationship)));

    Ok(())
}

async fn push_track(
    entities: &mut Vec<(Entity, Option<CreateRelationshipPayload>)>,
    spotify: &ClientCredsSpotify,
    user_id: Uuid,
) -> Result<(), Error> {
    let track_id = TrackId::from_id(entities[0].0.pk.clone())?;

    let full_track = spotify
        .track(
            track_id.clone(),
            Some(Market::Country(Country::UnitedStates)),
        )
        .await
        .map_internal()?;
    info!(
        track_id = track_id.id();
        "fetched full track details",
    );

    entities[0].0.title = Some(full_track.name.clone());
    entities[0].0.profile_picture_url = get_first_image_url(&full_track.album.images);
    entities[0].0.metadata = Some(serde_json::to_value(&full_track).map_internal()?);

    let Some(album_id) = &full_track.album.id else {
        warn!("skipping track with missing album ID");
        return Ok(());
    };

    let album_entity = Entity {
        pk_namespace: "spotify.album".to_string(),
        pk: album_id.id().to_string(),
        user_id,
        title: None,
        profile_picture_url: None,
        metadata: None,
        created_at: None,
    };

    let Some(artist_id) = &full_track.artists[0].id else {
        warn!("skipping track with missing artist ID");
        return Ok(());
    };

    let artist_entity = Entity {
        pk_namespace: "spotify.artist".to_string(),
        pk: artist_id.id().to_string(),
        user_id,
        title: None,
        profile_picture_url: None,
        metadata: None,
        created_at: None,
    };

    for artist in full_track.artists {
        push_simplified_artist(entities, user_id, artist, album_entity.clone())?;
    }

    info!(
        track_id = track_id.id();
        "ensuring album for track (in tx)",
    );
    push_simplified_album(entities, user_id, full_track.album, artist_entity)?;

    Ok(())
}

fn push_simplified_track(
    entities: &mut Vec<(Entity, Option<CreateRelationshipPayload>)>,
    user_id: Uuid,
    track: SimplifiedTrack,
    album: Entity,
) -> Result<(), Error> {
    let Some(track_id) = track.id.clone() else {
        warn!("skipping track with missing ID");
        return Ok(());
    };

    let track_entity = Entity {
        user_id,
        pk_namespace: "spotify.track".to_string(),
        pk: track_id.id().to_string(),
        title: Some(track.name.clone()),
        profile_picture_url: entities[0].0.profile_picture_url.clone(),
        metadata: Some(serde_json::to_value(&track).map_internal()?),
        created_at: None,
    };

    let relationship = CreateRelationshipPayload {
        parent_pk_namespace: album.pk_namespace.clone(),
        parent_pk: album.pk.clone(),
        child_pk_namespace: track_entity.pk_namespace.clone(),
        child_pk: track_entity.pk.clone(),
    };

    entities.push((track_entity, Some(relationship)));

    for artist in track.artists {
        push_simplified_artist(entities, user_id, artist, album.clone())?;
    }

    Ok(())
}

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
    let mut tx = state.db.begin().await.map_error("spotify entity")?;

    let (mut entities, initial_status_code) = if let Some(entity) = create_entity_ignore_conflict(
        &mut *tx,
        &payload.pk_namespace,
        &payload.pk,
        payload.title.as_deref(),
        None,
        payload.metadata.as_ref(),
        state.spotify_user.id,
    )
    .await?
    {
        info!(
            namespace = &payload.pk_namespace,
            pk = payload.pk;
            "entity inserted",
        );
        (vec![(entity, None)], StatusCode::CREATED)
    } else {
        info!(
            namespace = &payload.pk_namespace,
            pk = payload.pk;
            "entity already existed",
        );
        (
            vec![(
                get_entity(&mut tx, false, false, &payload.pk_namespace, &payload.pk)
                    .await?
                    .entity,
                None,
            )],
            StatusCode::OK,
        )
    };

    info!(
        namespace = payload.pk_namespace,
        pk = payload.pk;
        "fetching full details from Spotify for new entity",
    );

    match payload.pk_namespace.as_str() {
        "spotify.artist" => {
            push_artist(&mut entities, spotify, state.spotify_user.id).await?;
        }
        "spotify.album" => {
            push_album(&mut entities, spotify, state.spotify_user.id).await?;
        }
        "spotify.track" => {
            push_track(&mut entities, spotify, state.spotify_user.id).await?;
        }
        _ => {
            warn!(
                pk_namespace = payload.pk_namespace;
                "namespace was inserted but not handled for deep fetching",
            );
        }
    }

    let response = Json(
        get_entity(&mut tx, false, false, &payload.pk_namespace, &payload.pk)
            .await?
            .entity,
    );

    for (entity, relationship) in entities {
        create_entity_ignore_conflict(
            &mut *tx,
            &entity.pk_namespace,
            &entity.pk,
            entity.title.as_deref(),
            entity.profile_picture_url.as_deref(),
            entity.metadata.as_ref(),
            state.spotify_user.id,
        )
        .await?;

        let Some(relationship) = relationship else {
            continue;
        };

        create_relationship_ignore_conflict(&mut *tx, relationship, state.spotify_user.id).await?;
    }

    tx.commit().await.map_error("spotify entity")?;

    Ok((initial_status_code, response))
}

pub fn routes() -> Router<crate::app_state::AppState> {
    Router::new()
        .route("/search", get(search_spotify))
        .route("/ensure", post(ensure_spotify_entity))
}
