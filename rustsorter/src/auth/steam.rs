use anyhow::{anyhow, Result};
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
use std::collections::HashMap;
use url::Url;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    models::{Error, MapErrorSqlx, User, UserProvider},
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
        .append_pair("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select")
        .append_pair("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select");

    Ok(url.to_string())
}

fn extract_steam_id_from_identity(identity: &str) -> Result<String> {
    let url = Url::parse(identity)?;
    let path_segments: Vec<&str> = url.path_segments().ok_or_else(|| anyhow!("Invalid identity URL"))?.collect();
    
    if let Some(steam_id) = path_segments.last() {
        Ok(steam_id.to_string())
    } else {
        Err(anyhow!("Could not extract Steam ID from identity"))
    }
}

async fn verify_steam_openid(params: &SteamAuthQuery, client: &reqwest::Client) -> Result<bool> {
    let mut form_params = HashMap::new();
    form_params.insert("openid.assoc_handle", params.openid_assoc_handle.as_deref().unwrap_or(""));
    form_params.insert("openid.signed", params.openid_signed.as_deref().unwrap_or(""));
    form_params.insert("openid.sig", params.openid_sig.as_deref().unwrap_or(""));
    form_params.insert("openid.ns", params.openid_ns.as_deref().unwrap_or(""));
    form_params.insert("openid.mode", "check_authentication");
    form_params.insert("openid.claimed_id", params.openid_claimed_id.as_deref().unwrap_or(""));
    form_params.insert("openid.identity", params.openid_identity.as_deref().unwrap_or(""));
    form_params.insert("openid.return_to", params.openid_return_to.as_deref().unwrap_or(""));
    form_params.insert("openid.response_nonce", params.openid_response_nonce.as_deref().unwrap_or(""));

    let response = client
        .post(STEAM_OPENID_URL)
        .form(&form_params)
        .send()
        .await?;

    let body = response.text().await?;
    Ok(body.contains("is_valid:true"))
}

async fn fetch_steam_user_data(steam_id: &str, api_key: &str, client: &reqwest::Client) -> Result<(SteamPlayerSummary, Option<SteamPlayerBans>, Option<Vec<SteamOwnedGame>>)> {
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
    
    let player = players.first()
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
        "{}/IPlayerService/GetOwnedGames/v1/?key={}&steamid={}&include_played_free_games=1&include_appinfo=1",
        STEAM_API_BASE, api_key, steam_id
    );
    
    let games_response = client.get(&games_url).send().await?;
    let games_json: Value = games_response.json().await?;
    
    let games = games_json["response"]["games"]
        .as_array()
        .map(|games_array| {
            games_array.iter()
                .filter_map(|game| serde_json::from_value(game.clone()).ok())
                .collect::<Vec<SteamOwnedGame>>()
        });

    Ok((summary, bans, games))
}

async fn create_or_update_user_from_steam(
    pool: &PgPool,
    steam_id: &str,
    summary: &SteamPlayerSummary,
    bans: &Option<SteamPlayerBans>,
    games: &Option<Vec<SteamOwnedGame>>,
) -> Result<User, Error> {
    // Check if user already exists
    let existing_provider = sqlx::query_as!(
        UserProvider,
        "SELECT user_id, provider_id, external_id, external_username, profile_data, linked_at, last_sync_at 
         FROM user_providers WHERE provider_id = 'steam' AND external_id = $1",
        steam_id
    )
    .fetch_optional(pool)
    .await
    .map_error("user provider")?;

    let user = if let Some(provider) = existing_provider {
        // User exists, fetch and update
        sqlx::query_as!(
            User,
            "SELECT id, handle, display_name, username, primary_provider, avatar_url, bio, created_at 
             FROM users WHERE id = $1",
            provider.user_id
        )
        .fetch_one(pool)
        .await
        .map_error("user")?
    } else {
        // Create new user with auto-generated handle
        let base_handle = summary.personaname.chars()
            .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
            .collect::<String>()
            .to_lowercase();
        
        let mut handle = base_handle.clone();
        let mut counter = 1;
        
        // Ensure handle uniqueness
        while sqlx::query!("SELECT handle FROM users WHERE handle = $1", handle)
            .fetch_optional(pool)
            .await
            .map_error("user")?
            .is_some()
        {
            handle = format!("{}{}", base_handle, counter);
            counter += 1;
        }

        let user_id = Uuid::new_v4();
        
        sqlx::query!(
            "INSERT INTO users (id, handle, display_name, username, primary_provider, avatar_url)
             VALUES ($1, $2, $3, $4, $5, $6)",
            user_id,
            handle,
            summary.personaname,
            summary.personaname, // temporary for backward compatibility
            "steam",
            summary.avatarfull
        )
        .execute(pool)
        .await
        .map_error("user")?;

        // Link Steam provider
        sqlx::query!(
            "INSERT INTO user_providers (user_id, provider_id, external_id, external_username, profile_data)
             VALUES ($1, 'steam', $2, $3, $4)",
            user_id,
            steam_id,
            summary.personaname,
            serde_json::to_value(summary).unwrap()
        )
        .execute(pool)
        .await
        .map_error("user provider")?;

        User {
            id: user_id,
            handle,
            display_name: Some(summary.personaname.clone()),
            username: summary.personaname.clone(),
            primary_provider: Some("steam".to_string()),
            avatar_url: Some(summary.avatarfull.clone()),
            bio: None,
            created_at: None,
        }
    };

    // Update/create Steam user data
    let tf2_playtime = games.as_ref()
        .and_then(|games| games.iter().find(|game| game.appid == 440)) // TF2 app ID
        .map(|game| game.playtime_forever)
        .unwrap_or(0);

    let total_games = games.as_ref().map(|games| games.len() as i32).unwrap_or(0);

    sqlx::query!(
        "INSERT INTO steam_user_data (user_id, steam_id, account_created, playtime_tf2, total_games, profile_state, vac_banned, game_bans, days_since_last_ban, last_api_sync)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           playtime_tf2 = $4,
           total_games = $5,
           profile_state = $6,
           vac_banned = $7,
           game_bans = $8,
           days_since_last_ban = $9,
           last_api_sync = NOW()",
        user.id,
        steam_id,
        summary.timecreated.and_then(|ts| chrono::DateTime::from_timestamp(ts, 0))
            .map(|dt| dt.naive_utc()),
        tf2_playtime,
        total_games,
        summary.profilestate,
        bans.as_ref().map(|b| b.vac_banned).unwrap_or(false),
        bans.as_ref().map(|b| b.number_of_game_bans).unwrap_or(0),
        bans.as_ref().map(|b| b.days_since_last_ban)
    )
    .execute(pool)
    .await
    .map_error("steam user data")?;

    Ok(user)
}

pub async fn steam_login(State(state): State<AppState>) -> impl IntoResponse {
    let return_url = format!("{}/auth/steam/callback", state.base_url);
    
    match get_steam_login_url(&return_url) {
        Ok(login_url) => {
            debug!("Redirecting to Steam login: {}", login_url);
            Redirect::to(&login_url).into_response()
        }
        Err(e) => {
            warn!("Failed to generate Steam login URL: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate login URL").into_response()
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
        return (StatusCode::BAD_REQUEST, "Invalid OpenID response").into_response();
    }

    let client = reqwest::Client::new();
    
    match verify_steam_openid(&params, &client).await {
        Ok(true) => {
            debug!("Steam OpenID verification successful");
        }
        Ok(false) => {
            warn!("Steam OpenID verification failed");
            return (StatusCode::UNAUTHORIZED, "Steam authentication failed").into_response();
        }
        Err(e) => {
            warn!("Error during Steam OpenID verification: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Authentication error").into_response();
        }
    }

    // Extract Steam ID
    let steam_id = match params.openid_identity.as_ref()
        .and_then(|identity| extract_steam_id_from_identity(identity).ok()) {
        Some(id) => id,
        None => {
            warn!("Failed to extract Steam ID from identity");
            return (StatusCode::BAD_REQUEST, "Invalid Steam identity").into_response();
        }
    };

    info!("Authenticated Steam user: {}", steam_id);

    // Fetch Steam user data
    let (summary, bans, games) = match fetch_steam_user_data(&steam_id, &state.steam_api_key, &client).await {
        Ok(data) => data,
        Err(e) => {
            warn!("Failed to fetch Steam user data: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to fetch user data").into_response();
        }
    };

    // Create or update user
    let user = match create_or_update_user_from_steam(&state.db, &steam_id, &summary, &bans, &games).await {
        Ok(user) => user,
        Err(e) => {
            warn!("Failed to create/update user: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to create user").into_response();
        }
    };

    // For now, redirect to frontend with user handle
    // In production, you'd want to create a session or JWT token
    let redirect_url = format!("{}/login-success?handle={}", state.frontend_url, user.handle);
    Redirect::to(&redirect_url).into_response()
}
