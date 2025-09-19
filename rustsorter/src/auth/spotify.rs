use anyhow::{Context, Result};
use axum::{
    extract::{Query, State},
    http::HeaderMap,
    response::{IntoResponse, Redirect, Response},
};
use chrono::{Duration, NaiveDateTime, Utc};
use log::{debug, error, info, warn};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    auth_middleware::extract_session_id_from_cookie,
    models::{Error, MapErrorSqlx, TempSessionData, User},
    sessions,
};

const SPOTIFY_AUTHORIZE_URL: &str = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const SPOTIFY_ME_URL: &str = "https://api.spotify.com/v1/me";
const SPOTIFY_SCOPES: &str = "user-read-email user-read-private";

#[derive(Debug, Deserialize, Serialize)]
pub struct SpotifyAuthQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct SpotifyImage {
    url: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct SpotifyProfile {
    id: String,
    display_name: Option<String>,
    email: Option<String>,
    product: Option<String>,
    images: Option<Vec<SpotifyImage>>,
}

#[derive(Debug, Deserialize)]
struct SpotifyTokenResponse {
    access_token: String,
    _token_type: String,
    expires_in: i64,
    refresh_token: Option<String>,
    _scope: Option<String>,
}

pub async fn spotify_login(State(state): State<AppState>) -> impl IntoResponse {
    let state_id = Uuid::new_v4().to_string();

    if let Err(err) =
        sessions::create_oauth_state(&state.db, &state_id, "spotify", "login", None, None).await
    {
        error!("failed to persist oauth state: {}", err);
        return redirect_to_error(&state, "session_error");
    }

    match build_authorize_url(&state, &state_id) {
        Ok(url) => Redirect::to(&url).into_response(),
        Err(err) => {
            error!("failed to build spotify authorize url: {}", err);
            redirect_to_error(&state, "spotify_auth_error")
        }
    }
}

pub async fn spotify_link(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let Some(session_id) = extract_session_id_from_cookie(&headers) else {
        return redirect_to_error(&state, "no_session");
    };

    let session_result = sessions::get_session_with_user(&state.db, session_id).await;
    let (session, user) = match session_result {
        Ok(Some((session, Some(user)))) => (session, user),
        Ok(Some((_session, None))) => {
            return redirect_to_error(&state, "no_session");
        }
        Ok(None) => {
            return redirect_to_error(&state, "no_session");
        }
        Err(err) => {
            error!("failed to load session for linking: {}", err);
            return redirect_to_error(&state, "session_error");
        }
    };

    if session.session_type != "full" {
        return redirect_to_error(&state, "session_error");
    }

    let state_id = Uuid::new_v4().to_string();

    if let Err(err) =
        sessions::create_oauth_state(&state.db, &state_id, "spotify", "link", Some(user.id), None)
            .await
    {
        error!("failed to persist oauth state for linking: {}", err);
        return redirect_to_error(&state, "session_error");
    }

    match build_authorize_url(&state, &state_id) {
        Ok(url) => Redirect::to(&url).into_response(),
        Err(err) => {
            error!("failed to build spotify authorize url: {}", err);
            redirect_to_error(&state, "spotify_auth_error")
        }
    }
}

pub async fn spotify_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<SpotifyAuthQuery>,
) -> impl IntoResponse {
    debug!("Spotify callback params: {:?}", params);

    if let Some(error) = &params.error {
        warn!("Spotify returned error: {}", error);
        return redirect_to_error(&state, "spotify_auth_error");
    }

    let Some(returned_state) = params.state.as_ref() else {
        warn!("missing state parameter in callback");
        return redirect_to_error(&state, "spotify_auth_error");
    };

    let oauth_state = match sessions::consume_oauth_state(&state.db, returned_state).await {
        Ok(Some(record)) => record,
        Ok(None) => {
            warn!("no oauth state found for id {}", returned_state);
            return redirect_to_error(&state, "spotify_auth_error");
        }
        Err(err) => {
            error!("failed to consume oauth state: {}", err);
            return redirect_to_error(&state, "spotify_auth_error");
        }
    };

    if oauth_state.provider_id != "spotify" {
        warn!(
            "oauth state provider mismatch: expected spotify, got {}",
            oauth_state.provider_id
        );
        return redirect_to_error(&state, "spotify_auth_error");
    }

    let Some(code) = params.code.as_ref() else {
        warn!("missing code parameter in callback");
        return redirect_to_error(&state, "spotify_auth_error");
    };

    let client = Client::new();

    let token_response = match exchange_code_for_tokens(&client, &state, code).await {
        Ok(tokens) => tokens,
        Err(err) => {
            warn!("token exchange failed: {}", err);
            return redirect_to_error(&state, "spotify_auth_error");
        }
    };

    let access_token = token_response.access_token.clone();
    let refresh_token = token_response.refresh_token.clone();
    let expires_at = Utc::now() + Duration::seconds(token_response.expires_in);

    let profile = match fetch_spotify_profile(&client, &access_token).await {
        Ok(profile) => profile,
        Err(err) => {
            warn!("failed to fetch profile: {}", err);
            return redirect_to_error(&state, "spotify_profile_error");
        }
    };

    let avatar_url = profile
        .images
        .as_ref()
        .and_then(|images| images.first())
        .and_then(|image| image.url.clone());

    match oauth_state.purpose.as_str() {
        "login" => match handle_login_flow(
            &state,
            &profile,
            &access_token,
            refresh_token.as_deref(),
            expires_at.naive_utc(),
            avatar_url,
        )
        .await
        {
            Ok(response) => response,
            Err(err) => {
                warn!("login flow failed: {}", err);
                redirect_to_error(&state, "session_error")
            }
        },
        "link" => {
            let Some(target_user_id) = oauth_state.user_id else {
                warn!("link flow missing user id");
                return redirect_to_error(&state, "session_error");
            };

            // Ensure the caller still has a valid session
            match validate_link_session(&state.db, target_user_id, &headers).await {
                Ok(()) => {}
                Err(err) => {
                    warn!("link session validation failed: {}", err);
                    return redirect_to_error(&state, "session_error");
                }
            }

            match handle_link_flow(
                &state,
                target_user_id,
                &profile,
                &access_token,
                refresh_token.as_deref(),
                expires_at.naive_utc(),
                avatar_url,
            )
            .await
            {
                Ok(response) => response,
                Err(err) => {
                    warn!("link flow failed: {}", err);
                    redirect_to_error(&state, "session_error")
                }
            }
        }
        "" | _ => {
            warn!("unknown oauth purpose: {}", oauth_state.purpose);
            redirect_to_error(&state, "spotify_auth_error")
        }
    }
}

fn redirect_to_error(state: &AppState, reason: &str) -> Response {
    Redirect::to(&format!(
        "{}/auth/error?reason={}",
        state.frontend_url, reason
    ))
    .into_response()
}

fn build_authorize_url(state: &AppState, oauth_state: &str) -> Result<String> {
    let mut url = url::Url::parse(SPOTIFY_AUTHORIZE_URL)?;
    {
        let mut query = url.query_pairs_mut();
        query.append_pair("client_id", &state.spotify_client_id);
        query.append_pair("response_type", "code");
        query.append_pair("redirect_uri", &state.spotify_redirect_uri);
        query.append_pair("scope", SPOTIFY_SCOPES);
        query.append_pair("state", oauth_state);
    }

    Ok(url.into())
}

async fn exchange_code_for_tokens(
    client: &Client,
    state: &AppState,
    code: &str,
) -> Result<SpotifyTokenResponse> {
    let response = client
        .post(SPOTIFY_TOKEN_URL)
        .basic_auth(&state.spotify_client_id, Some(&state.spotify_client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", state.spotify_redirect_uri.as_str()),
        ])
        .send()
        .await
        .context("post token request")?
        .error_for_status()
        .context("token response status")?
        .json::<SpotifyTokenResponse>()
        .await
        .context("deserialize token response")?;

    Ok(response)
}

async fn fetch_spotify_profile(client: &Client, access_token: &str) -> Result<SpotifyProfile> {
    let response = client
        .get(SPOTIFY_ME_URL)
        .bearer_auth(access_token)
        .send()
        .await
        .context("fetch spotify profile")?
        .error_for_status()
        .context("spotify profile status")?
        .json::<SpotifyProfile>()
        .await
        .context("deserialize spotify profile")?;

    Ok(response)
}

async fn handle_login_flow(
    state: &AppState,
    profile: &SpotifyProfile,
    access_token: &str,
    refresh_token: Option<&str>,
    expires_at: NaiveDateTime,
    avatar_url: Option<String>,
) -> Result<Response, Error> {
    match check_existing_spotify_user(&state.db, &profile.id).await? {
        Some(user) => {
            info!(
                "Existing Spotify user {} matched to handle {}",
                profile.id, user.handle
            );

            update_provider_tokens(
                &state.db,
                user.id,
                &profile.id,
                profile.display_name.as_deref(),
                access_token,
                refresh_token,
                expires_at,
                avatar_url.clone(),
                profile,
            )
            .await?;

            let session_id = sessions::create_full_session(&state.db, user.id).await?;

            let mut response =
                Redirect::to(&format!("{}/auth/success", state.frontend_url)).into_response();
            attach_session_cookie(&mut response, session_id, Duration::days(30));
            Ok(response)
        }
        None => {
            info!("Spotify user {} is new, starting onboarding", profile.id);
            let suggested_handle = generate_suggested_handle(
                profile.display_name.as_deref(),
                profile.email.as_deref(),
                &profile.id,
            );

            let temp_data = TempSessionData {
                provider_id: "spotify".to_string(),
                external_id: profile.id.clone(),
                display_name: profile.display_name.clone(),
                avatar_url: avatar_url.clone(),
                email: profile.email.clone(),
                suggested_handle,
                profile_data: serde_json::to_value(profile).ok(),
                access_token: Some(access_token.to_string()),
                refresh_token: refresh_token.map(|value| value.to_string()),
                expires_at: Some(expires_at),
            };

            let session_id =
                sessions::create_temp_session(&state.db, "spotify", &temp_data).await?;

            let mut response =
                Redirect::to(&format!("{}/auth/choose-username", state.frontend_url))
                    .into_response();
            attach_session_cookie(&mut response, session_id, Duration::minutes(15));
            Ok(response)
        }
    }
}

async fn handle_link_flow(
    state: &AppState,
    user_id: Uuid,
    profile: &SpotifyProfile,
    access_token: &str,
    refresh_token: Option<&str>,
    expires_at: NaiveDateTime,
    avatar_url: Option<String>,
) -> Result<Response, Error> {
    // Ensure the account isn't linked to another user
    if let Some(conflicting_user) = check_existing_spotify_user(&state.db, &profile.id).await? {
        if conflicting_user.id != user_id {
            return Err(Error::Conflict {
                object: "spotify account".into(),
            });
        }
    }

    update_provider_tokens(
        &state.db,
        user_id,
        &profile.id,
        profile.display_name.as_deref(),
        access_token,
        refresh_token,
        expires_at,
        avatar_url.clone(),
        profile,
    )
    .await?;

    let redirect_url = format!("{}/profile?linked=spotify", state.frontend_url);
    Ok(Redirect::to(&redirect_url).into_response())
}

fn attach_session_cookie(response: &mut Response, session_id: Uuid, ttl: Duration) {
    let max_age = ttl.num_seconds();
    let cookie = format!(
        "session_id={}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}",
        session_id, max_age
    );
    response
        .headers_mut()
        .insert("Set-Cookie", cookie.parse().unwrap());
}

async fn validate_link_session(
    pool: &PgPool,
    expected_user_id: Uuid,
    headers: &HeaderMap,
) -> Result<(), Error> {
    let session_id = extract_session_id_from_cookie(headers).ok_or(Error::NoCredentials)?;
    let Some((session, Some(user))) = sessions::get_session_with_user(pool, session_id).await?
    else {
        return Err(Error::NoCredentials);
    };

    if session.session_type != "full" || user.id != expected_user_id {
        return Err(Error::Unauthorized);
    }

    Ok(())
}

async fn check_existing_spotify_user(
    pool: &PgPool,
    spotify_id: &str,
) -> Result<Option<User>, Error> {
    let existing_provider = sqlx::query!(
        "SELECT user_id FROM user_providers WHERE provider_id = 'spotify' AND external_id = $1",
        spotify_id
    )
    .fetch_optional(pool)
    .await
    .map_error("user provider")?;

    if let Some(record) = existing_provider {
        let user = sqlx::query_as!(
            User,
            "SELECT id, handle, display_name, username, primary_provider, avatar_url, bio, \
             created_at 
             FROM users WHERE id = $1",
            record.user_id
        )
        .fetch_one(pool)
        .await
        .map_error("user")?;

        Ok(Some(user))
    } else {
        Ok(None)
    }
}

async fn update_provider_tokens(
    pool: &PgPool,
    user_id: Uuid,
    spotify_id: &str,
    display_name: Option<&str>,
    access_token: &str,
    refresh_token: Option<&str>,
    expires_at: NaiveDateTime,
    avatar_url: Option<String>,
    profile: &SpotifyProfile,
) -> Result<(), Error> {
    let profile_json = serde_json::to_value(profile).ok();

    sqlx::query!(
        "INSERT INTO user_providers (user_id, provider_id, external_id, external_username, \
         profile_data, access_token, refresh_token, expires_at)
         VALUES ($1, 'spotify', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, provider_id) DO UPDATE SET
            external_id = EXCLUDED.external_id,
            external_username = EXCLUDED.external_username,
            profile_data = EXCLUDED.profile_data,
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            expires_at = EXCLUDED.expires_at,
            last_sync_at = NOW()",
        user_id,
        spotify_id,
        display_name,
        profile_json,
        access_token,
        refresh_token,
        expires_at
    )
    .execute(pool)
    .await
    .map_error("user provider upsert")?;

    sqlx::query!(
        "INSERT INTO spotify_user_data (user_id, spotify_user_id, display_name, email, product, \
         avatar_url, last_api_sync)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
            spotify_user_id = EXCLUDED.spotify_user_id,
            display_name = EXCLUDED.display_name,
            email = EXCLUDED.email,
            product = EXCLUDED.product,
            avatar_url = EXCLUDED.avatar_url,
            last_api_sync = EXCLUDED.last_api_sync",
        user_id,
        spotify_id,
        display_name,
        profile.email.as_deref(),
        profile.product.as_deref(),
        avatar_url.as_deref()
    )
    .execute(pool)
    .await
    .map_error("spotify profile upsert")?;

    if let Some(avatar) = avatar_url.as_deref() {
        sqlx::query!(
            "UPDATE users SET avatar_url = $1 WHERE id = $2",
            avatar,
            user_id
        )
        .execute(pool)
        .await
        .map_error("user avatar update")?;
    }

    Ok(())
}

fn generate_suggested_handle(
    display_name: Option<&str>,
    email: Option<&str>,
    spotify_id: &str,
) -> String {
    if let Some(name) = display_name.and_then(|value| sanitize_handle_candidate(value)) {
        return name;
    }

    if let Some(mail) = email.and_then(|value| value.split('@').next()) {
        if let Some(candidate) = sanitize_handle_candidate(mail) {
            return candidate;
        }
    }

    let suffix = if spotify_id.len() >= 6 {
        &spotify_id[..6]
    } else {
        spotify_id
    };

    format!("spotify{}", suffix)
}

fn sanitize_handle_candidate(value: &str) -> Option<String> {
    let filtered: String = value
        .chars()
        .filter_map(|c| {
            let lower = c.to_ascii_lowercase();
            if lower.is_ascii_alphanumeric() || lower == '-' || lower == '_' {
                Some(lower)
            } else if lower.is_whitespace() {
                Some('-')
            } else {
                None
            }
        })
        .collect();

    let trimmed = filtered.trim_matches(['-', '_']);

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.chars().take(50).collect())
    }
}
