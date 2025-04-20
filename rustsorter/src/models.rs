use axum::{
    extract::{rejection::JsonRejection, FromRequest},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;
use uuid::Uuid;
use chrono::NaiveDateTime;

#[derive(FromRequest)]
#[from_request(via(axum::Json), rejection(ErrorResponse))]
pub struct Json<T>(pub T);

impl<T: Serialize> IntoResponse for Json<T> {
    fn into_response(self) -> Response {
        axum::Json(self.0).into_response()
    }
}

#[derive(Serialize, Debug, Clone)]
pub struct ErrorResponse {
    #[serde(skip)]
    status_code: StatusCode,
    error: String,
}

impl From<JsonRejection> for ErrorResponse {
    fn from(rejection: JsonRejection) -> Self {
        Self {
            status_code: rejection.status(),
            error: rejection.body_text(),
        }
    }
}

impl ErrorResponse {
    pub fn new(status_code: StatusCode, error: String) -> Self {
        Self { status_code, error }
    }
}

impl IntoResponse for ErrorResponse {
    fn into_response(self) -> Response {
        (self.status_code, Json(self)).into_response()
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