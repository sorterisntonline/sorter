use std::collections::HashMap;

use anyhow::{Result, anyhow};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
};
use log::{debug, info, warn};
use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use url::Url;

use crate::{
    app_state::AppState,
    models::{Error, MapErrorSqlx, TempSessionData, User, UserProvider},
    sessions,
};

const STEAM_OPENID_URL: &str = "https://steamcommunity.com/openid/login";
const STEAM_API_BASE: &str = "https://api.steampowered.com";

#[derive(Debug, Deserialize)]
pub struct SteamAuthQuery {
    #[serde(rename = "openid.mode")]
    openid_mode: Option<String>,
    #[serde(rename = "openid.identity")]
    openid_identity: Option<String>,
    #[serde(rename = "openid.claimed_id")]
    openid_claimed_id: Option<String>,
    #[serde(rename = "openid.response_nonce")]
    openid_response_nonce: Option<String>,
    #[serde(rename = "openid.return_to")]
    openid_return_to: Option<String>,
    #[serde(rename = "openid.assoc_handle")]
    openid_assoc_handle: Option<String>,
    #[serde(rename = "openid.signed")]
    openid_signed: Option<String>,
    #[serde(rename = "openid.sig")]
    openid_sig: Option<String>,
    #[serde(rename = "openid.ns")]
    openid_ns: Option<String>,
    #[serde(rename = "openid.op_endpoint")]
    openid_op_endpoint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamPlayerSummary {
    pub steamid: String,
    pub personaname: String,
    pub profileurl: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub avatarfull: String,
    pub personastate: i32,
    pub timecreated: Option<i64>,
    pub profilestate: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamPlayerBans {
    #[serde(rename = "SteamId")]
    pub steam_id: String,
    #[serde(rename = "VACBanned")]
    pub vac_banned: bool,
    #[serde(rename = "NumberOfGameBans")]
    pub number_of_game_bans: i32,
    #[serde(rename = "DaysSinceLastBan")]
    pub days_since_last_ban: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SteamOwnedGame {
    pub appid: i32,
    pub playtime_forever: i32,
}

pub fn get_steam_login_url(return_url: &str) -> Result<String> {
    let mut url = Url::parse(STEAM_OPENID_URL)?;

    url.query_pairs_mut()
        .append_pair("openid.ns", "http://specs.openid.net/auth/2.0")
        .append_pair("openid.mode", "checkid_setup")
        .append_pair("openid.return_to", return_url)
        .append_pair("openid.realm", return_url)
        .append_pair(
            "openid.identity",
            "http://specs.openid.net/auth/2.0/identifier_select",
        )
        .append_pair(
            "openid.claimed_id",
            "http://specs.openid.net/auth/2.0/identifier_select",
        );

    Ok(url.to_string())
}

fn generate_suggested_handle(steam_name: &str) -> String {
    steam_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect::<String>()
        .to_lowercase()
        .chars()
        .take(20) // Limit length
        .collect()
}

fn steam_id_suffix<'a>(steam_id: &'a str, count: usize) -> &'a str {
    let len = steam_id.len();
    if len == 0 {
        return steam_id;
    }

    let suffix_len = count.min(len);
    &steam_id[len - suffix_len..]
}

fn extract_steam_id_from_identity(identity: &str) -> Result<String> {
    let url = Url::parse(identity)?;
    let path_segments: Vec<&str> = url
        .path_segments()
        .ok_or_else(|| anyhow!("Invalid identity URL"))?
        .collect();

    if let Some(steam_id) = path_segments.last() {
        Ok(steam_id.to_string())
    } else {
        Err(anyhow!("Could not extract Steam ID from identity"))
    }
}

async fn verify_steam_openid(params: &SteamAuthQuery, client: &reqwest::Client) -> Result<bool> {
    let mut form_params = HashMap::new();
    form_params.insert(
        "openid.assoc_handle",
        params.openid_assoc_handle.as_deref().unwrap_or(""),
    );
    form_params.insert(
        "openid.signed",
        params.openid_signed.as_deref().unwrap_or(""),
    );
    form_params.insert("openid.sig", params.openid_sig.as_deref().unwrap_or(""));
    form_params.insert("openid.ns", params.openid_ns.as_deref().unwrap_or(""));
    form_params.insert("openid.mode", "check_authentication");
    form_params.insert(
        "openid.claimed_id",
        params.openid_claimed_id.as_deref().unwrap_or(""),
    );
    form_params.insert(
        "openid.identity",
        params.openid_identity.as_deref().unwrap_or(""),
    );
    form_params.insert(
        "openid.return_to",
        params.openid_return_to.as_deref().unwrap_or(""),
    );
    form_params.insert(
        "openid.response_nonce",
        params.openid_response_nonce.as_deref().unwrap_or(""),
    );
    form_params.insert(
        "openid.op_endpoint",
        params.openid_op_endpoint.as_deref().unwrap_or(""),
    );

    debug!(
        "Sending verification request to Steam with params: {:?}",
        form_params
    );

    let response = client
        .post(STEAM_OPENID_URL)
        .form(&form_params)
        .send()
        .await?;

    let body = response.text().await?;
    debug!("Steam verification response: {}", body);

    let is_valid = body.contains("is_valid:true");
    debug!("Steam verification result: {}", is_valid);

    Ok(is_valid)
}

async fn fetch_steam_user_data(
    steam_id: &str,
    api_key: &str,
    client: &reqwest::Client,
) -> Result<(
    SteamPlayerSummary,
    Option<SteamPlayerBans>,
    Option<Vec<SteamOwnedGame>>,
)> {
    // Get player summary
    let summary_url = format!(
        "{}/ISteamUser/GetPlayerSummaries/v2/?key={}&steamids={}",
        STEAM_API_BASE, api_key, steam_id
    );

    let summary_response = client.get(&summary_url).send().await?;
    let summary_json: Value = summary_response.json().await?;

    let players = summary_json["response"]["players"]
        .as_array()
        .ok_or_else(|| anyhow!("No players in Steam API response"))?;

    let player = players
        .first()
        .ok_or_else(|| anyhow!("Player not found in Steam API response"))?;

    let summary: SteamPlayerSummary = serde_json::from_value(player.clone())?;

    // Get player bans
    let bans_url = format!(
        "{}/ISteamUser/GetPlayerBans/v1/?key={}&steamids={}",
        STEAM_API_BASE, api_key, steam_id
    );

    let bans_response = client.get(&bans_url).send().await?;
    let bans_json: Value = bans_response.json().await?;

    let bans = bans_json["players"]
        .as_array()
        .and_then(|arr| arr.first())
        .map(|ban| serde_json::from_value(ban.clone()))
        .transpose()?;

    // Get owned games (specifically looking for TF2)
    let games_url = format!(
        "{}/IPlayerService/GetOwnedGames/v1/?key={}&steamid={}&include_played_free_games=1&\
         include_appinfo=1",
        STEAM_API_BASE, api_key, steam_id
    );

    let games_response = client.get(&games_url).send().await?;
    let games_json: Value = games_response.json().await?;

    let games = games_json["response"]["games"]
        .as_array()
        .map(|games_array| {
            games_array
                .iter()
                .filter_map(|game| serde_json::from_value(game.clone()).ok())
                .collect::<Vec<SteamOwnedGame>>()
        });

    Ok((summary, bans, games))
}

async fn check_existing_steam_user(pool: &PgPool, steam_id: &str) -> Result<Option<User>, Error> {
    let existing_provider = sqlx::query_as!(
        UserProvider,
        "SELECT user_id, provider_id, external_id, external_username, profile_data, linked_at, \
         last_sync_at 
         FROM user_providers WHERE provider_id = 'steam' AND external_id = $1",
        steam_id
    )
    .fetch_optional(pool)
    .await
    .map_error("user provider")?;

    if let Some(provider) = existing_provider {
        let user = sqlx::query_as!(
            User,
            "SELECT id, handle, display_name, username, primary_provider, avatar_url, bio, \
             created_at 
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

pub async fn steam_login(State(state): State<AppState>) -> impl IntoResponse {
    let return_url = format!("{}/api/auth/steam/callback", state.base_url);

    match get_steam_login_url(&return_url) {
        Ok(login_url) => {
            debug!("Redirecting to Steam login: {}", login_url);
            Redirect::to(&login_url).into_response()
        }
        Err(e) => {
            warn!("Failed to generate Steam login URL: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to generate login URL",
            )
                .into_response()
        }
    }
}

pub async fn steam_callback(
    State(state): State<AppState>,
    Query(params): Query<SteamAuthQuery>,
) -> impl IntoResponse {
    debug!("Steam callback received with params: {:?}", params);

    // Verify the OpenID response
    if params.openid_mode.as_deref() != Some("id_res") {
        warn!("Invalid OpenID mode: {:?}", params.openid_mode);
        let redirect_url = format!("{}/auth/error?reason=invalid_openid", state.frontend_url);
        return Redirect::to(&redirect_url).into_response();
    }

    let client = reqwest::Client::new();

    match verify_steam_openid(&params, &client).await {
        Ok(true) => {
            debug!("Steam OpenID verification successful");
        }
        Ok(false) => {
            warn!("Steam OpenID verification failed");
            let redirect_url =
                format!("{}/auth/error?reason=steam_auth_failed", state.frontend_url);
            return Redirect::to(&redirect_url).into_response();
        }
        Err(e) => {
            warn!("Error during Steam OpenID verification: {}", e);
            let redirect_url = format!(
                "{}/auth/error?reason=verification_error",
                state.frontend_url
            );
            return Redirect::to(&redirect_url).into_response();
        }
    }

    // Extract Steam ID
    let steam_id = match params
        .openid_identity
        .as_ref()
        .and_then(|identity| extract_steam_id_from_identity(identity).ok())
    {
        Some(id) => id,
        None => {
            warn!("Failed to extract Steam ID from identity");
            let redirect_url = format!("{}/auth/error?reason=invalid_steam_id", state.frontend_url);
            return Redirect::to(&redirect_url).into_response();
        }
    };

    info!("Authenticated Steam user: {}", steam_id);

    // Check if user already exists
    match check_existing_steam_user(&state.db, &steam_id).await {
        Ok(Some(user)) => {
            // Existing user - create full session and redirect to success
            debug!("Existing user found: {}", user.handle);

            match sessions::create_full_session(&state.db, user.id).await {
                Ok(session_id) => {
                    let mut response =
                        Redirect::to(&format!("{}/auth/success", state.frontend_url))
                            .into_response();

                    // Set session cookie
                    let cookie = format!(
                        "session_id={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000",
                        session_id
                    ); // 30 days
                    response
                        .headers_mut()
                        .insert("Set-Cookie", cookie.parse().unwrap());

                    response
                }
                Err(e) => {
                    warn!("Failed to create session: {}", e);
                    let redirect_url =
                        format!("{}/auth/error?reason=session_error", state.frontend_url);
                    Redirect::to(&redirect_url).into_response()
                }
            }
        }
        Ok(None) => {
            debug!("New user, creating temp session with Steam bootstrap data");

            let mut steam_display_name: Option<String> = None;
            let mut steam_avatar_url: Option<String> = None;
            let mut suggested_handle: Option<String> = None;

            let has_real_api_key = !state.steam_api_key.is_empty()
                && state.steam_api_key != "dummy_key_for_development";

            if has_real_api_key {
                match fetch_steam_user_data(&steam_id, &state.steam_api_key, &client).await {
                    Ok((summary, _bans, _games)) => {
                        if !summary.personaname.trim().is_empty() {
                            steam_display_name = Some(summary.personaname.clone());

                            let generated = generate_suggested_handle(&summary.personaname);
                            if !generated.is_empty() {
                                suggested_handle = Some(generated);
                            }
                        }

                        if !summary.avatarfull.trim().is_empty() {
                            steam_avatar_url = Some(summary.avatarfull.clone());
                        } else if !summary.avatarmedium.trim().is_empty() {
                            steam_avatar_url = Some(summary.avatarmedium.clone());
                        }
                    }
                    Err(error) => {
                        warn!("Failed to fetch Steam profile data: {}", error);
                    }
                }
            }

            let default_avatar = "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/fe/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg".to_string();
            let fallback_display = format!("SteamUser{}", steam_id_suffix(&steam_id, 6));
            let fallback_handle = format!("user{}", steam_id_suffix(&steam_id, 4));

            let chosen_display = steam_display_name.unwrap_or(fallback_display);
            let chosen_avatar = steam_avatar_url.unwrap_or(default_avatar);
            let chosen_handle = suggested_handle
                .filter(|value| !value.is_empty())
                .unwrap_or(fallback_handle);

            let temp_data = TempSessionData {
                steam_id: steam_id.clone(),
                steam_username: chosen_display,
                steam_avatar: chosen_avatar,
                suggested_handle: chosen_handle,
            };

            match sessions::create_temp_session(&state.db, "steam", &temp_data).await {
                Ok(session_id) => {
                    let mut response =
                        Redirect::to(&format!("{}/auth/choose-username", state.frontend_url))
                            .into_response();

                    // Set session cookie
                    let cookie = format!(
                        "session_id={}; HttpOnly; SameSite=Lax; Path=/; Max-Age=900",
                        session_id
                    ); // 15 min
                    response
                        .headers_mut()
                        .insert("Set-Cookie", cookie.parse().unwrap());

                    response
                }
                Err(e) => {
                    warn!("Failed to create temp session: {}", e);
                    let redirect_url =
                        format!("{}/auth/error?reason=session_error", state.frontend_url);
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
