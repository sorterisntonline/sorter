use std::fmt::{self, Display};

use axum::{
    extract::{FromRequest, rejection::JsonRejection},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::NaiveDateTime;
use log::{error, warn};
use serde::Serialize;
use serde_json::json;
use sqlx::postgres::PgQueryResult;
use uuid::Uuid;

#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(Error))]
pub struct Json<T>(pub T);

impl<T: Serialize> IntoResponse for Json<T> {
    fn into_response(self) -> Response {
        axum::Json(self.0).into_response()
    }
}

pub trait MapError<T> {
    fn map_internal(self) -> Result<T, Error>;
}

impl<T, E: Into<anyhow::Error>> MapError<T> for Result<T, E> {
    fn map_internal(self) -> Result<T, Error> {
        self.map_err(|e| Error::Internal(e.into()))
    }
}

pub trait MapErrorSqlx<T> {
    fn ignore_conflict(self) -> Result<Option<T>, sqlx::Error>;
    fn map_error(self, object: &str) -> Result<T, Error>;
}

impl<T> MapErrorSqlx<T> for Result<T, sqlx::Error> {
    fn ignore_conflict(self) -> Result<Option<T>, sqlx::Error> {
        if let Err(sqlx::Error::Database(e)) = &self {
            if e.is_unique_violation() {
                return Ok(None);
            }
        }

        self.map(Some)
    }

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

#[derive(Debug, thiserror::Error)]
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

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub auth0_sub: String,
    pub username: String,
    pub avatar_url: Option<String>,
    pub bio: Option<String>,
    pub created_at: Option<NaiveDateTime>,
}
