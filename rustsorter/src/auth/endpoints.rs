use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::IntoResponse,
};
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};

use uuid::Uuid;

use crate::{
    app_state::AppState,
    auth_middleware::extract_session_id_from_cookie,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, Json, MapErrorSqlx, TempSessionData, User, UserProvider},
    sessions,
};

#[derive(Serialize)]
pub struct SessionStatusResponse {
    pub authenticated: bool,
    pub session_type: Option<String>, // "temp" | "full"
    pub user: Option<User>,
    pub temp_data: Option<TempSessionData>,
}

#[derive(Deserialize)]
pub struct CompleteSignupRequest {
    pub handle: String,
}

#[derive(Serialize)]
pub struct CompleteSignupResponse {
    pub user: User,
    pub message: String,
}

#[derive(Serialize)]
pub struct LogoutResponse {
    pub message: String,
}



fn validate_handle(handle: &str) -> Result<(), Error> {
    if !handle.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
        return Err(Error::BadRequest {
            message: "handle can only contain letters, numbers, underscores, and hyphens".into(),
        });
    }
    
    if handle.len() < 1 || handle.len() > 50 {
        return Err(Error::BadRequest {
            message: "handle must be between 1 and 50 characters".into(),
        });
    }
    
    Ok(())
}

async fn check_handle_availability(pool: &sqlx::PgPool, handle: &str) -> Result<bool, Error> {
    let existing = sqlx::query!("SELECT handle FROM users WHERE handle = $1", handle)
        .fetch_optional(pool)
        .await
        .map_error("handle check")?;
    
    Ok(existing.is_none())
}

pub async fn session_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SessionStatusResponse>, Error> {
    let session_id = extract_session_id_from_cookie(&headers);
    
    let Some(session_id) = session_id else {
        return Ok(Json(SessionStatusResponse {
            authenticated: false,
            session_type: None,
            user: None,
            temp_data: None,
        }));
    };

    match sessions::get_session_with_user(&state.db, session_id).await? {
        Some((session, user)) => {
            let temp_data = if session.session_type == "temp" {
                session.data.and_then(|data| serde_json::from_value(data).ok())
            } else {
                None
            };

            Ok(Json(SessionStatusResponse {
                authenticated: user.is_some() || session.session_type == "temp",
                session_type: Some(session.session_type),
                user,
                temp_data,
            }))
        }
        None => Ok(Json(SessionStatusResponse {
            authenticated: false,
            session_type: None,
            user: None,
            temp_data: None,
        })),
    }
}

pub async fn complete_signup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CompleteSignupRequest>,
) -> Result<Json<CompleteSignupResponse>, Error> {
    let session_id = extract_session_id_from_cookie(&headers)
        .ok_or(Error::NoCredentials)?;

    // Validate handle
    validate_handle(&payload.handle)?;
    
    // Check availability
    if !check_handle_availability(&state.db, &payload.handle).await? {
        return Err(Error::Conflict { 
            object: "handle".into() 
        });
    }

    // Get temp session
    let (session, _) = sessions::get_session_with_user(&state.db, session_id)
        .await?
        .ok_or(Error::NotFound { object: "session".into() })?;
    
    if session.session_type != "temp" {
        return Err(Error::BadRequest { 
            message: "session is not a temp session".into() 
        });
    }

    // Extract temp data  
    let session_data = session.data.clone();
    let temp_data: TempSessionData = session_data
        .ok_or(Error::BadRequest { message: "session has no temp data".into() })
        .and_then(|data| serde_json::from_value(data)
            .map_err(|_| Error::BadRequest { message: "invalid temp data".into() }))?;

    // Create user
    let user_id = Uuid::new_v4();
    
    sqlx::query!(
        "INSERT INTO users (id, handle, display_name, username, primary_provider, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)",
        user_id,
        payload.handle,
        temp_data.spotify_username,
        temp_data.spotify_username, // backward compatibility
        session.provider_id,
        temp_data.spotify_avatar
    )
    .execute(&state.db)
    .await
    .map_error("user creation")?;

    // Link provider with tokens (if available from session data)
    if let Some(provider_id) = &session.provider_id {
        // Try to get tokens from session data if stored there, otherwise just use basic temp_data
        let profile_data = session.data
            .clone()
            .unwrap_or_else(|| serde_json::to_value(&temp_data).unwrap());
            
        sqlx::query!(
            "INSERT INTO user_providers (user_id, provider_id, external_id, external_username, profile_data)
             VALUES ($1, $2, $3, $4, $5)",
            user_id,
            provider_id,
            temp_data.spotify_id,
            temp_data.spotify_username,
            profile_data
        )
        .execute(&state.db)
        .await
        .map_error("provider link")?;
    }

    // Upgrade session to full
    sessions::upgrade_temp_session(&state.db, session_id, user_id).await?;

    let user = User {
        id: user_id,
        handle: payload.handle.clone(),
        display_name: Some(temp_data.spotify_username.clone()),
        username: temp_data.spotify_username,
        primary_provider: session.provider_id,
        avatar_url: Some(temp_data.spotify_avatar),
        bio: None,
        created_at: None,
    };

    Ok(Json(CompleteSignupResponse {
        user,
        message: "Account created successfully".to_string(),
    }))
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let session_id = extract_session_id_from_cookie(&headers);
    
    if let Some(session_id) = session_id {
        if let Err(e) = sessions::delete_session(&state.db, session_id).await {
            log::warn!("Failed to delete session: {}", e);
        }
    }

    let mut response = Json(LogoutResponse {
        message: "Logged out successfully".to_string(),
    }).into_response();
    
    // Clear session cookie
    response.headers_mut().insert(
        "Set-Cookie", 
        "session_id=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0".parse().unwrap()
    );
    
    response
}

pub async fn me(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<User>, Error> {
    let session_id = extract_session_id_from_cookie(&headers)
        .ok_or(Error::NoCredentials)?;

    let (session, user) = sessions::get_session_with_user(&state.db, session_id)
        .await?
        .ok_or(Error::NotFound { object: "session".into() })?;
    
    if session.session_type != "full" {
        return Err(Error::Unauthorized);
    }

    let user = user.ok_or(Error::Unauthorized)?;
    Ok(Json(user))
}

#[derive(Deserialize)]
pub struct HandleAvailabilityQuery {
    pub handle: String,
}

#[derive(Serialize)]
pub struct HandleAvailabilityResponse {
    pub available: bool,
    pub valid: bool,
    pub message: Option<String>,
}

pub async fn check_handle(
    State(state): State<AppState>,
    Query(query): Query<HandleAvailabilityQuery>,
) -> Result<Json<HandleAvailabilityResponse>, Error> {
    let handle = query.handle.trim();
    
    // Validate format
    let valid = validate_handle(handle).is_ok();
    let message = if !valid {
        Some("Handle can only contain letters, numbers, underscores, and hyphens (1-50 characters)".to_string())
    } else {
        None
    };

    let available = if valid {
        check_handle_availability(&state.db, handle).await?
    } else {
        false
    };

    Ok(Json(HandleAvailabilityResponse {
        available,
        valid,
        message,
    }))
}

#[derive(Serialize)]
pub struct ImportRecentSongsResponse {
    pub imported_count: i32,
    pub message: String,
}

pub async fn import_recent_songs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ImportRecentSongsResponse>, Error> {
    let session_id = extract_session_id_from_cookie(&headers)
        .ok_or(Error::NoCredentials)?;

    let (session, user) = sessions::get_session_with_user(&state.db, session_id)
        .await?
        .ok_or(Error::NotFound { object: "session".into() })?;
    
    if session.session_type != "full" {
        return Err(Error::Unauthorized);
    }

    let user = user.ok_or(Error::Unauthorized)?;

    // Get user's Spotify access token from user_providers
    let provider = sqlx::query_as!(
        UserProvider,
        "SELECT user_id, provider_id, external_id, external_username, profile_data, linked_at, last_sync_at 
         FROM user_providers WHERE user_id = $1 AND provider_id = 'spotify'",
        user.id
    )
    .fetch_optional(&state.db)
    .await
    .map_error("user provider")?
    .ok_or(Error::BadRequest { message: "No Spotify account linked".into() })?;

    // Extract tokens and metadata from profile_data
    let mut profile_data = provider.profile_data.ok_or(Error::BadRequest { 
        message: "No Spotify profile data found".into() 
    })?;
    
    let mut access_token = profile_data.get("access_token")
        .and_then(|token| token.as_str())
        .ok_or(Error::BadRequest { 
            message: "No Spotify access token found".into() 
        })?.to_string();

    let refresh_token = profile_data.get("refresh_token")
        .and_then(|token| token.as_str())
        .ok_or(Error::BadRequest { 
            message: "No Spotify refresh token found".into() 
        })?;

    let expires_in = profile_data.get("expires_in")
        .and_then(|exp| exp.as_i64())
        .ok_or(Error::BadRequest { 
            message: "No token expiration info found".into() 
        })? as i32;

    let token_obtained_at = profile_data.get("token_obtained_at")
        .and_then(|ts| ts.as_i64())
        .ok_or(Error::BadRequest { 
            message: "No token timestamp found".into() 
        })?;

    let client = reqwest::Client::new();
    
    // Check if token is expired and refresh if needed
    if crate::auth::spotify::is_token_expired(expires_in, token_obtained_at) {
        debug!("Spotify token expired, refreshing...");
        
        match crate::auth::spotify::refresh_spotify_token(
            &client,
            refresh_token,
            &state.spotify_client_id,
            &state.spotify_client_secret,
        ).await {
            Ok(token_response) => {
                access_token = token_response.access_token.clone();
                
                // Update stored tokens in database
                if let Some(obj) = profile_data.as_object_mut() {
                    obj.insert("access_token".to_string(), serde_json::Value::String(token_response.access_token));
                    obj.insert("expires_in".to_string(), serde_json::Value::Number(serde_json::Number::from(token_response.expires_in)));
                    obj.insert("token_obtained_at".to_string(), serde_json::Value::Number(serde_json::Number::from(chrono::Utc::now().timestamp())));
                    
                    // Update refresh_token if provided (Spotify may rotate it)
                    if let Some(new_refresh_token) = token_response.refresh_token {
                        obj.insert("refresh_token".to_string(), serde_json::Value::String(new_refresh_token));
                    }
                }
                
                if let Err(e) = sqlx::query!(
                    "UPDATE user_providers SET profile_data = $1, last_sync_at = NOW() 
                     WHERE user_id = $2 AND provider_id = 'spotify'",
                    serde_json::Value::Object(profile_data.as_object().unwrap().clone()),
                    user.id
                )
                .execute(&state.db)
                .await {
                    warn!("Failed to update refreshed tokens: {}", e);
                }
                
                info!("Successfully refreshed Spotify token for user {}", user.handle);
            }
            Err(e) => {
                warn!("Failed to refresh Spotify token: {}", e);
                return Err(Error::BadRequest { 
                    message: format!("Failed to refresh expired Spotify token: {}", e).into() 
                });
            }
        }
    }
    
    // Fetch recent tracks from Spotify API
    let recent_tracks = crate::auth::spotify::fetch_recent_tracks(&client, &access_token, Some(20))
        .await
        .map_err(|e| Error::BadRequest { 
            message: format!("Failed to fetch Spotify data: {}", e).into() 
        })?;

    // Ensure user entity exists in sorter.user namespace
    let _user_entity = crate::entity::upsert_entity(
        &state.db,
        "sorter.user",
        &user.handle,
        Some(&user.display_name.clone().unwrap_or(user.handle.clone())),
        Some("User account"),
        None, // No metadata for user entity
        user.id,
    ).await?;

    let mut imported_count = 0;
    
    for item in recent_tracks.items {
        let track = item.track;
        let artist_names: Vec<&str> = track.artists.iter().map(|a| a.name.as_str()).collect();
        let artist_display = artist_names.join(", ");
        let description = format!("by {}", artist_display);
        
        // Store full Spotify track data as metadata
        let track_metadata = serde_json::to_value(&track).unwrap();
        
        let _track_entity = crate::entity::upsert_entity(
            &state.db,
            "spotify.track",
            &track.id,
            Some(&track.name),
            Some(&description),
            Some(&track_metadata),
            user.id,
        ).await?;

        // Create user -> track relationship
        let relationship_payload = crate::entity_relationships::CreateRelationshipPayload {
            parent_ns: "sorter.user".to_string(),
            parent_pk: user.handle.clone(),
            child_ns: "spotify.track".to_string(),
            child_pk: track.id.clone(),
        };
        
        let _relationship = crate::entity_relationships::upsert_relationship(
            &state.db,
            relationship_payload,
            user.id,
        ).await?;

        imported_count += 1;
    }

    Ok(Json(ImportRecentSongsResponse {
        imported_count,
        message: format!("Successfully imported {} recent songs", imported_count),
    }))
}

#[derive(Serialize)]
pub struct SpotifySong {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art: Option<String>,
    pub duration_ms: i32,
    pub preview_url: Option<String>,
    pub spotify_url: String,
}

pub async fn get_spotify_access_token(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
) -> Result<Json<serde_json::Value>, Error> {
    // Get user's Spotify access token from user_providers
    let provider = sqlx::query_as!(
        UserProvider,
        "SELECT user_id, provider_id, external_id, external_username, profile_data, linked_at, last_sync_at 
         FROM user_providers WHERE user_id = $1 AND provider_id = 'spotify'",
        user.id
    )
    .fetch_optional(&state.db)
    .await
    .map_error("user provider")?
    .ok_or(Error::BadRequest { message: "No Spotify account linked".into() })?;

    // Extract tokens from profile_data
    let profile_data = provider.profile_data.ok_or(Error::BadRequest { 
        message: "No Spotify profile data found".into() 
    })?;
    
    let access_token = profile_data.get("access_token")
        .and_then(|token| token.as_str())
        .ok_or(Error::BadRequest { 
            message: "No Spotify access token found".into() 
        })?;

    Ok(Json(serde_json::json!({
        "access_token": access_token
    })))
}

pub async fn get_user_spotify_songs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<SpotifySong>>, Error> {
    let session_id = extract_session_id_from_cookie(&headers)
        .ok_or(Error::NoCredentials)?;

    let (session, user) = sessions::get_session_with_user(&state.db, session_id)
        .await?
        .ok_or(Error::NotFound { object: "session".into() })?;
    
    if session.session_type != "full" {
        return Err(Error::Unauthorized);
    }

    let user = user.ok_or(Error::Unauthorized)?;

    // Get user's Spotify track entities directly
    let tracks = sqlx::query!(
        "SELECT e.ns, e.pk, e.title, e.metadata 
         FROM entities e
         JOIN entity_relationships er ON e.ns = er.child_ns AND e.pk = er.child_pk
         WHERE er.parent_ns = 'sorter.user' AND er.parent_pk = $1 AND e.ns = 'spotify.track'
         ORDER BY er.created_at DESC",
        user.handle
    )
    .fetch_all(&state.db)
    .await
    .map_error("spotify tracks")?;

    let mut songs = Vec::new();
    
    for track in tracks {
        if let Some(metadata) = track.metadata {
            // Parse Spotify track data from metadata
            if let Ok(track_data) = serde_json::from_value::<crate::auth::spotify::SpotifyTrack>(metadata) {
                let artist_names: Vec<&str> = track_data.artists.iter().map(|a| a.name.as_str()).collect();
                let album_art = track_data.album.images.first().map(|img| img.url.clone());
                
                songs.push(SpotifySong {
                    id: track_data.id,
                    title: track_data.name,
                    artist: artist_names.join(", "),
                    album: track_data.album.name,
                    album_art,
                    duration_ms: track_data.duration_ms,
                    preview_url: track_data.preview_url,
                    spotify_url: track_data.external_urls.spotify,
                });
            }
        }
    }

    Ok(Json(songs))
}
