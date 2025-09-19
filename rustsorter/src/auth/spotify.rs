use anyhow::{anyhow, Result};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
};
use log::{debug, info, warn};
use reqwest;
use serde::{Deserialize, Serialize};

use sqlx::PgPool;
use url::Url;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{Error, MapErrorSqlx, TempSessionData, User, UserProvider},
    sessions,
};

const SPOTIFY_ACCOUNTS_URL: &str = "https://accounts.spotify.com";
const SPOTIFY_API_BASE: &str = "https://api.spotify.com/v1";

#[derive(Debug, Deserialize)]
pub struct SpotifyAuthQuery {
    code: Option<String>,
    error: Option<String>,
    state: Option<String>,
}

#[derive(Debug, Serialize)]
struct SpotifyTokenRequest {
    grant_type: String,
    code: String,
    redirect_uri: String,
    client_id: String,
    client_secret: String,
}

#[derive(Debug, Deserialize)]
struct SpotifyTokenResponse {
    access_token: String,
    token_type: String,
    expires_in: i32,
    refresh_token: Option<String>,
    scope: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyUser {
    pub id: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub images: Vec<SpotifyImage>,
    pub followers: SpotifyFollowers,
    pub external_urls: SpotifyExternalUrls,
    pub country: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyImage {
    pub url: String,
    pub height: Option<i32>,
    pub width: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyFollowers {
    pub total: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyExternalUrls {
    pub spotify: String,
}

pub fn get_spotify_login_url(
    client_id: &str,
    redirect_uri: &str,
    state: &str,
) -> Result<String> {
    let mut url = Url::parse(&format!("{}/authorize", SPOTIFY_ACCOUNTS_URL))?;
    
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("scope", "user-read-private user-read-email")
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("state", state);

    Ok(url.to_string())
}

fn generate_suggested_handle(display_name: Option<&String>, spotify_id: &str) -> String {
    let base_name = display_name
        .map(|name| name.as_str())
        .unwrap_or("user");
    
    let cleaned = base_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>()
        .to_lowercase()
        .chars()
        .take(15)
        .collect::<String>();
    
    if cleaned.is_empty() {
        format!("user{}", &spotify_id[spotify_id.len()-4..])
    } else {
        cleaned
    }
}

async fn exchange_code_for_token(
    client: &reqwest::Client,
    code: &str,
    client_id: &str,
    client_secret: &str,
    redirect_uri: &str,
) -> Result<SpotifyTokenResponse> {
    let token_request = SpotifyTokenRequest {
        grant_type: "authorization_code".to_string(),
        code: code.to_string(),
        redirect_uri: redirect_uri.to_string(),
        client_id: client_id.to_string(),
        client_secret: client_secret.to_string(),
    };

    let response = client
        .post(&format!("{}/api/token", SPOTIFY_ACCOUNTS_URL))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&token_request)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(anyhow!("Failed to exchange code for token: {}", error_text));
    }

    let token_response: SpotifyTokenResponse = response.json().await?;
    Ok(token_response)
}

async fn fetch_spotify_user_data(
    client: &reqwest::Client,
    access_token: &str,
) -> Result<SpotifyUser> {
    let response = client
        .get(&format!("{}/me", SPOTIFY_API_BASE))
        .bearer_auth(access_token)
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(anyhow!("Failed to fetch user data: {}", error_text));
    }

    let user: SpotifyUser = response.json().await?;
    Ok(user)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyRecentTracksResponse {
    pub items: Vec<SpotifyPlayHistoryItem>,
    pub next: Option<String>,
    pub cursors: Option<SpotifyCursors>,
    pub limit: i32,
    pub href: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyPlayHistoryItem {
    pub track: SpotifyTrack,
    pub played_at: String,
    pub context: Option<SpotifyContext>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyTrack {
    pub id: String,
    pub name: String,
    pub artists: Vec<SpotifyArtist>,
    pub album: SpotifyAlbum,
    pub duration_ms: i32,
    pub explicit: bool,
    pub external_urls: SpotifyExternalUrls,
    pub href: String,
    pub preview_url: Option<String>,
    pub track_number: i32,
    pub uri: String,
    pub is_local: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyArtist {
    pub id: String,
    pub name: String,
    pub external_urls: SpotifyExternalUrls,
    pub href: String,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyAlbum {
    pub id: String,
    pub name: String,
    pub artists: Vec<SpotifyArtist>,
    pub images: Vec<SpotifyImage>,
    pub external_urls: SpotifyExternalUrls,
    pub href: String,
    pub release_date: String,
    pub release_date_precision: String,
    pub total_tracks: i32,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyContext {
    #[serde(rename = "type")]
    pub context_type: String,
    pub href: String,
    pub external_urls: SpotifyExternalUrls,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SpotifyCursors {
    pub after: String,
    pub before: String,
}

pub async fn fetch_recent_tracks(
    client: &reqwest::Client,
    access_token: &str,
    limit: Option<i32>,
) -> Result<SpotifyRecentTracksResponse> {
    let limit = limit.unwrap_or(20).min(50); // Spotify API allows max 50
    
    let response = client
        .get(&format!("{}/me/player/recently-played", SPOTIFY_API_BASE))
        .bearer_auth(access_token)
        .query(&[("limit", limit)])
        .send()
        .await?;

    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(anyhow!("Failed to fetch recent tracks: {}", error_text));
    }

    let recent_tracks: SpotifyRecentTracksResponse = response.json().await?;
    Ok(recent_tracks)
}

async fn check_existing_spotify_user(
    pool: &PgPool,
    spotify_id: &str,
) -> Result<Option<User>, Error> {
    let existing_provider = sqlx::query_as!(
        UserProvider,
        "SELECT user_id, provider_id, external_id, external_username, profile_data, linked_at, last_sync_at 
         FROM user_providers WHERE provider_id = 'spotify' AND external_id = $1",
        spotify_id
    )
    .fetch_optional(pool)
    .await
    .map_error("user provider")?;

    if let Some(provider) = existing_provider {
        let user = sqlx::query_as!(
            User,
            "SELECT id, handle, display_name, username, primary_provider, avatar_url, bio, created_at 
             FROM users WHERE id = $1",
            provider.user_id
        )
        .fetch_one(pool)
        .await
        .map_error("user")?;
        
        Ok(Some(user))
    } else {
        Ok(None)
    }
}

pub async fn spotify_login(State(state): State<AppState>) -> impl IntoResponse {
    let redirect_uri = format!("{}/api/auth/spotify/callback", state.base_url);
    let csrf_state = Uuid::new_v4().to_string();
    
    match get_spotify_login_url(&state.spotify_client_id, &redirect_uri, &csrf_state) {
        Ok(login_url) => {
            debug!("Redirecting to Spotify login: {}", login_url);
            
            // Store CSRF state in session/cookie for validation
            let mut response = Redirect::to(&login_url).into_response();
            let cookie = format!("spotify_state={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600", csrf_state);
            response.headers_mut().insert("Set-Cookie", cookie.parse().unwrap());
            
            response
        }
        Err(e) => {
            warn!("Failed to generate Spotify login URL: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate login URL").into_response()
        }
    }
}

pub async fn spotify_callback(
    State(state): State<AppState>,
    Query(params): Query<SpotifyAuthQuery>,
) -> impl IntoResponse {
    debug!("Spotify callback received with params: {:?}", params);

    // Check for authorization errors
    if let Some(error) = &params.error {
        warn!("Spotify authorization error: {}", error);
        let redirect_url = format!("{}/auth/error?reason=spotify_auth_failed", state.frontend_url);
        return Redirect::to(&redirect_url).into_response();
    }

    let code = match &params.code {
        Some(code) => code,
        None => {
            warn!("No authorization code received from Spotify");
            let redirect_url = format!("{}/auth/error?reason=no_auth_code", state.frontend_url);
            return Redirect::to(&redirect_url).into_response();
        }
    };

    // TODO: Validate CSRF state parameter
    // For now, we'll skip state validation but should implement it

    let client = reqwest::Client::new();
    let redirect_uri = format!("{}/api/auth/spotify/callback", state.base_url);

    // Exchange code for access token
    let token_response = match exchange_code_for_token(
        &client,
        code,
        &state.spotify_client_id,
        &state.spotify_client_secret,
        &redirect_uri,
    ).await {
        Ok(response) => response,
        Err(e) => {
            warn!("Failed to exchange code for token: {}", e);
            let redirect_url = format!("{}/auth/error?reason=token_exchange_failed", state.frontend_url);
            return Redirect::to(&redirect_url).into_response();
        }
    };

    // Fetch user data from Spotify
    let spotify_user = match fetch_spotify_user_data(&client, &token_response.access_token).await {
        Ok(user) => user,
        Err(e) => {
            warn!("Failed to fetch Spotify user data: {}", e);
            let redirect_url = format!("{}/auth/error?reason=spotify_data_error", state.frontend_url);
            return Redirect::to(&redirect_url).into_response();
        }
    };

    info!("Authenticated Spotify user: {}", spotify_user.id);

    // Check if user already exists
    match check_existing_spotify_user(&state.db, &spotify_user.id).await {
        Ok(Some(user)) => {
            // Existing user - create full session and redirect to success
            debug!("Existing user found: {}", user.handle);
            
            match sessions::create_full_session(&state.db, user.id).await {
                Ok(session_id) => {
                    let mut response = Redirect::to(&format!("{}/auth/success", state.frontend_url)).into_response();
                    
                    // Set session cookie
                    let cookie = format!("session_id={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000", session_id);
                    response.headers_mut().insert("Set-Cookie", cookie.parse().unwrap());
                    
                    response
                }
                Err(e) => {
                    warn!("Failed to create session: {}", e);
                    let redirect_url = format!("{}/auth/error?reason=session_error", state.frontend_url);
                    Redirect::to(&redirect_url).into_response()
                }
            }
        }
        Ok(None) => {
            // New user - create temp session with Spotify data
            debug!("New user, creating temp session with Spotify data");
            
            let avatar_url = spotify_user.images
                .first()
                .map(|img| img.url.clone())
                .unwrap_or_else(|| "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp".to_string());
            
            let display_name = spotify_user.display_name
                .as_ref()
                .unwrap_or(&spotify_user.id);

            let temp_data = TempSessionData {
                spotify_id: spotify_user.id.clone(),
                spotify_username: display_name.clone(),
                spotify_avatar: avatar_url,
                suggested_handle: generate_suggested_handle(spotify_user.display_name.as_ref(), &spotify_user.id),
            };

            match sessions::create_temp_session(&state.db, "spotify", &temp_data).await {
                Ok(session_id) => {
                    let mut response = Redirect::to(&format!("{}/auth/choose-username", state.frontend_url)).into_response();
                    
                    // Set session cookie
                    let cookie = format!("session_id={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900", session_id);
                    response.headers_mut().insert("Set-Cookie", cookie.parse().unwrap());
                    
                    response
                }
                Err(e) => {
                    warn!("Failed to create temp session: {}", e);
                    let redirect_url = format!("{}/auth/error?reason=session_error", state.frontend_url);
                    Redirect::to(&redirect_url).into_response()
                }
            }
        }
        Err(e) => {
            warn!("Database error checking existing user: {}", e);
            let redirect_url = format!("{}/auth/error?reason=database_error", state.frontend_url);
            Redirect::to(&redirect_url).into_response()
        }
    }
}
