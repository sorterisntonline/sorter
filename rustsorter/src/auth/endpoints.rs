use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use schemars::JsonSchema;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    auth_middleware::extract_session_id_from_cookie,
    models::{Error, Json, MapErrorSqlx, TempSessionData, User},
    sessions,
};

#[derive(Serialize, JsonSchema)]
pub struct SessionStatusResponse {
    pub authenticated: bool,
    pub session_type: Option<String>, // "temp" | "full"
    pub user: Option<User>,
    pub temp_data: Option<TempSessionData>,
}

#[derive(Deserialize, JsonSchema)]
pub struct CompleteSignupRequest {
    pub handle: String,
}

#[derive(Serialize, JsonSchema)]
pub struct CompleteSignupResponse {
    pub user: User,
    pub message: String,
}

#[derive(Serialize, JsonSchema)]
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
                authenticated: user.is_some(),
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
    let temp_data: TempSessionData = session.data
        .ok_or(Error::BadRequest { message: "session has no temp data".into() })?
        .try_into()
        .map_err(|_| Error::BadRequest { message: "invalid temp data".into() })?;

    // Create user
    let user_id = Uuid::new_v4();
    
    sqlx::query!(
        "INSERT INTO users (id, handle, display_name, username, primary_provider, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)",
        user_id,
        payload.handle,
        temp_data.steam_username,
        temp_data.steam_username, // backward compatibility
        session.provider_id,
        temp_data.steam_avatar
    )
    .execute(&state.db)
    .await
    .map_error("user creation")?;

    // Link provider
    if let Some(provider_id) = &session.provider_id {
        sqlx::query!(
            "INSERT INTO user_providers (user_id, provider_id, external_id, external_username, profile_data)
             VALUES ($1, $2, $3, $4, $5)",
            user_id,
            provider_id,
            temp_data.steam_id,
            temp_data.steam_username,
            serde_json::to_value(&temp_data).unwrap()
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
        display_name: Some(temp_data.steam_username.clone()),
        username: temp_data.steam_username,
        primary_provider: session.provider_id,
        avatar_url: Some(temp_data.steam_avatar),
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

#[derive(Serialize, JsonSchema)]
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
