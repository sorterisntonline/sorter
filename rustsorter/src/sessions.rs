use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{Error, MapErrorSqlx, SessionType, TempSessionData, User, UserSession};

pub async fn create_temp_session(
    pool: &PgPool,
    provider_id: &str,
    data: &TempSessionData,
) -> Result<Uuid, Error> {
    let session_id = Uuid::new_v4();
    let expires_at = Utc::now().naive_utc() + chrono::Duration::minutes(15); // 15 min expiry
    
    sqlx::query!(
        "INSERT INTO user_sessions (id, session_type, provider_id, data, expires_at)
         VALUES ($1, $2, $3, $4, $5)",
        session_id,
        SessionType::Temp.as_str(),
        provider_id,
        serde_json::to_value(data).unwrap(),
        expires_at
    )
    .execute(pool)
    .await
    .map_error("temp session")?;
    
    Ok(session_id)
}

pub async fn create_full_session(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Uuid, Error> {
    let session_id = Uuid::new_v4();
    let expires_at = Utc::now().naive_utc() + chrono::Duration::days(30); // 30 day expiry
    
    sqlx::query!(
        "INSERT INTO user_sessions (id, user_id, session_type, expires_at)
         VALUES ($1, $2, $3, $4)",
        session_id,
        user_id,
        SessionType::Full.as_str(),
        expires_at
    )
    .execute(pool)
    .await
    .map_error("full session")?;
    
    Ok(session_id)
}

pub async fn get_session(pool: &PgPool, session_id: Uuid) -> Result<Option<UserSession>, Error> {
    let session = sqlx::query_as!(
        UserSession,
        "SELECT id, user_id, session_type, provider_id, data, expires_at, created_at 
         FROM user_sessions 
         WHERE id = $1 AND expires_at > NOW()",
        session_id
    )
    .fetch_optional(pool)
    .await
    .map_error("session")?;
    
    Ok(session)
}

pub async fn get_session_with_user(
    pool: &PgPool,
    session_id: Uuid,
) -> Result<Option<(UserSession, Option<User>)>, Error> {
    let session = get_session(pool, session_id).await?;
    
    if let Some(session) = session {
        let user = if let Some(user_id) = session.user_id {
            Some(
                sqlx::query_as!(
                    User,
                    "SELECT id, handle, display_name, username, primary_provider, avatar_url, bio, created_at 
                     FROM users WHERE id = $1",
                    user_id
                )
                .fetch_one(pool)
                .await
                .map_error("user")?,
            )
        } else {
            None
        };
        
        Ok(Some((session, user)))
    } else {
        Ok(None)
    }
}

pub async fn delete_session(pool: &PgPool, session_id: Uuid) -> Result<(), Error> {
    sqlx::query!("DELETE FROM user_sessions WHERE id = $1", session_id)
        .execute(pool)
        .await
        .map_error("session")?;
    
    Ok(())
}

pub async fn cleanup_expired_sessions(pool: &PgPool) -> Result<(), Error> {
    sqlx::query!("DELETE FROM user_sessions WHERE expires_at <= NOW()")
        .execute(pool)
        .await
        .map_error("expired sessions")?;
    
    Ok(())
}

pub async fn upgrade_temp_session(
    pool: &PgPool,
    session_id: Uuid,
    user_id: Uuid,
) -> Result<(), Error> {
    let expires_at = Utc::now().naive_utc() + chrono::Duration::days(30);
    
    sqlx::query!(
        "UPDATE user_sessions 
         SET user_id = $1, session_type = $2, data = NULL, provider_id = NULL, expires_at = $3
         WHERE id = $4 AND session_type = 'temp'",
        user_id,
        SessionType::Full.as_str(),
        expires_at,
        session_id
    )
    .execute(pool)
    .await
    .map_error("session upgrade")?;
    
    Ok(())
}
