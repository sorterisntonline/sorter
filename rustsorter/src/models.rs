use std::fmt::{self, Display};

use aide::{OperationInput, OperationIo, OperationOutput};
use axum::{
    extract::{FromRequest, rejection::JsonRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::NaiveDateTime;
use log::{error, warn};
use schemars::JsonSchema;
use serde::Serialize;
use serde_json::json;
use sqlx::{Acquire, Postgres, postgres::PgQueryResult};
use uuid::Uuid;

pub trait PgAcquire<'a>: Acquire<'a, Database = Postgres> {}

impl<'a, A: Acquire<'a, Database = Postgres>> PgAcquire<'a> for A {}

#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(Error))]
pub struct Json<T>(pub T);

impl<T: Serialize> IntoResponse for Json<T> {
    fn into_response(self) -> Response {
        axum::Json(self.0).into_response()
    }
}

impl<T: JsonSchema> OperationInput for Json<T> {
    fn operation_input(
        ctx: &mut aide::generate::GenContext,
        operation: &mut aide::openapi::Operation,
    ) {
        axum::Json::<T>::operation_input(ctx, operation);
    }
}

impl<T: JsonSchema> OperationOutput for Json<T> {
    type Inner = T;

    fn operation_response(
        ctx: &mut aide::generate::GenContext,
        operation: &mut aide::openapi::Operation,
    ) -> Option<aide::openapi::Response> {
        axum::Json::<T>::operation_response(ctx, operation)
    }

    fn inferred_responses(
        ctx: &mut aide::generate::GenContext,
        operation: &mut aide::openapi::Operation,
    ) -> Vec<(Option<u16>, aide::openapi::Response)> {
        axum::Json::<T>::inferred_responses(ctx, operation)
    }
}

pub trait MapErrorAnyhow<T> {
    fn map_internal(self) -> Result<T, Error>;
}

impl<T, E: Into<anyhow::Error>> MapErrorAnyhow<T> for Result<T, E> {
    fn map_internal(self) -> Result<T, Error> {
        self.map_err(|e| Error::Internal(e.into()))
    }
}

pub trait MapErrorSqlx<T> {
    fn map_error(self, object: &str) -> Result<T, Error>;
}

impl<T> MapErrorSqlx<T> for Result<T, sqlx::Error> {
    fn map_error(self, object: &str) -> Result<T, Error> {
        self.map_err(|err| match err {
            sqlx::Error::RowNotFound => Error::NotFound {
                object: object.into(),
            },
            sqlx::Error::Database(e) if e.is_unique_violation() => Error::Conflict {
                object: object.into(),
            },
            sqlx::Error::Database(e) if e.is_check_violation() => Error::BadRequest {
                message: object.into(),
            },
            sqlx::Error::Database(e) if e.is_foreign_key_violation() => Error::NotFound {
                object: object.into(),
            },
            _ => Error::Internal(err.into()),
        })
    }
}

pub trait IntoNotFound<T> {
    fn catch_not_found(self, object: &str) -> Result<T, Error>;
}

impl IntoNotFound<PgQueryResult> for PgQueryResult {
    fn catch_not_found(self, object: &str) -> Result<PgQueryResult, Error> {
        if self.rows_affected() == 0 {
            return Err(Error::NotFound {
                object: object.into(),
            });
        }

        Ok(self)
    }
}

impl<T> IntoNotFound<T> for Option<T> {
    fn catch_not_found(self, object: &str) -> Result<T, Error> {
        self.ok_or_else(|| Error::NotFound {
            object: object.into(),
        })
    }
}

#[derive(Debug)]
pub struct CapitalizedString(String);

impl From<String> for CapitalizedString {
    fn from(s: String) -> Self {
        CapitalizedString(s)
    }
}

impl From<&str> for CapitalizedString {
    fn from(s: &str) -> Self {
        CapitalizedString(s.to_owned())
    }
}

impl Display for CapitalizedString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut chars = self.0.chars();

        if let Some(c) = chars.next() {
            write!(f, "{}", c.to_uppercase())?;
        }

        write!(f, "{}", chars.as_str())
    }
}

#[derive(Debug, thiserror::Error, OperationIo)]
pub enum Error {
    #[error("{message}")]
    BadRequest { message: CapitalizedString },
    #[error("{object} already exists")]
    Conflict { object: CapitalizedString },
    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),
    #[error("Invalid Authorization header format")]
    InvalidHeader,
    #[error("Invalid API key format")]
    InvalidKeyFormat,
    #[error("No authentication credentials provided")]
    NoCredentials,
    #[error("{0}")]
    JsonRejection(#[from] JsonRejection),
    #[error("{object} not found")]
    NotFound { object: CapitalizedString },
    #[error("Unauthorized")]
    Unauthorized,
}

impl Error {
    fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest { .. } => StatusCode::BAD_REQUEST,
            Self::Conflict { .. } => StatusCode::CONFLICT,
            Self::Internal(..) => StatusCode::INTERNAL_SERVER_ERROR,
            Self::InvalidHeader
            | Self::InvalidKeyFormat
            | Self::NoCredentials
            | Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::JsonRejection(error) => error.status(),
            Self::NotFound { .. } => StatusCode::NOT_FOUND,
        }
    }
}

impl IntoResponse for Error {
    fn into_response(self) -> Response {
        if let Self::Internal(error) = &self {
            error!(error:?; "internal error");
        } else {
            warn!(self:%; "user error");
        }

        (
            self.status_code(),
            Json(json!({ "error": self.to_string() })),
        )
            .into_response()
    }
}

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone, schemars::JsonSchema)]
pub struct User {
    pub id: Uuid,
    pub handle: String,
    pub display_name: Option<String>,
    pub username: String, // Keep for backward compatibility, will eventually remove
    pub primary_provider: Option<String>,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub created_at: Option<NaiveDateTime>,
}

// Temporary struct to bridge the old ApiKeyDb structure
#[derive(sqlx::FromRow, Debug, Clone)]
pub struct ApiKeyDbInternal {
    pub id: i32,
    pub user_id: Option<Uuid>,
    pub name: String,
    pub key_identifier: String,
    pub hashed_key: String,
    pub created_at: NaiveDateTime,
    pub last_used_at: Option<NaiveDateTime>,
    pub active: bool,
}

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone)]
pub struct UserProvider {
    pub user_id: Uuid,
    pub provider_id: String,
    pub external_id: String,
    pub external_username: Option<String>,
    pub profile_data: Option<serde_json::Value>,
    pub linked_at: Option<NaiveDateTime>,
    pub last_sync_at: Option<NaiveDateTime>,
}

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone)]
pub struct SteamUserData {
    pub user_id: Uuid,
    pub steam_id: String,
    pub account_created: Option<NaiveDateTime>,
    pub playtime_tf2: Option<i32>,
    pub total_games: Option<i32>,
    pub profile_state: Option<i32>,
    pub vac_banned: Option<bool>,
    pub game_bans: Option<i32>,
    pub days_since_last_ban: Option<i32>,
    pub last_api_sync: Option<NaiveDateTime>,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone)]
pub struct SteamMedal {
    pub user_id: Uuid,
    pub item_def_id: i32,
    pub tournament_name: Option<String>,
    pub medal_type: Option<String>,
    pub season: Option<String>,
    pub division: Option<String>,
    pub discovered_at: Option<NaiveDateTime>,
}

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone)]
pub struct UserSession {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub session_type: String, // 'temp' or 'full'
    pub provider_id: Option<String>,
    pub data: Option<serde_json::Value>,
    pub expires_at: NaiveDateTime,
    pub created_at: Option<NaiveDateTime>,
}

#[derive(serde::Serialize, Debug, Clone)]
pub enum SessionType {
    Temp,
    Full,
}

impl SessionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            SessionType::Temp => "temp",
            SessionType::Full => "full",
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, schemars::JsonSchema)]
pub struct TempSessionData {
    pub steam_id: String,
    pub steam_username: String,
    pub steam_avatar: String,
    pub suggested_handle: String,
}
