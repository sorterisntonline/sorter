use async_trait::async_trait;
use axum::{
    extract::{FromRequestParts, Request},
    Extension,
    http::request::Parts,
    response::{IntoResponse, Response},
};

use crate::models::User; // Assuming your User model is in crate::models

// A wrapper type for the optional user.
pub struct MaybeUser(pub Option<User>);

#[async_trait]
impl<S> FromRequestParts<S> for MaybeUser
where
    S: Send + Sync,
{
    // Define an error type for the extractor.
    // Using AuthError here might be misleading as this extractor itself won't return auth errors.
    // A dedicated extractor error or `Infallible` might be clearer if this extractor truly cannot fail.
    // However, using `AuthError` allows potential future use cases or keeps error types consistent.
    // Let's use `Infallible` for now as this specific extractor logic doesn't produce AuthErrors.
    type Rejection = std::convert::Infallible; // This extractor cannot fail

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // Attempt to extract the User added by the middleware
        let user = parts.extensions.get::<User>().cloned();

        if user.is_some() {
            log::debug!("MaybeUser extractor found authenticated user in request extensions.");
        } else {
            log::debug!("MaybeUser extractor did not find authenticated user in request extensions.");
        }

        // Always return Ok, the presence of the user is in the Option
        Ok(MaybeUser(user))
    }
}

pub struct AuthenticatedUser(pub User);

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedUser
where
    S: Send + Sync,
{
    type Rejection = crate::auth_middleware::AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let user = parts.extensions.get::<User>().cloned();
        if let Some(user) = user {
            Ok(AuthenticatedUser(user))
        } else {
            Err(crate::auth_middleware::AuthError::NoCredentials)
        }
    }
}   
