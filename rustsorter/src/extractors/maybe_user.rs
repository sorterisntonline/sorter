use async_trait::async_trait;
use axum::{extract::FromRequestParts, http::request::Parts};

use crate::models::{Error, User};

pub struct MaybeUser(pub Option<User>);

#[async_trait]
impl<S> FromRequestParts<S> for MaybeUser
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let user = parts.extensions.get::<User>().cloned();

        if user.is_some() {
            log::debug!("MaybeUser extractor found authenticated user in request extensions.");
        } else {
            log::debug!(
                "MaybeUser extractor did not find authenticated user in request extensions."
            );
        }

        Ok(MaybeUser(user))
    }
}

pub struct AuthenticatedUser(pub User);

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedUser
where
    S: Send + Sync,
{
    type Rejection = Error;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let user = parts.extensions.get::<User>().cloned();
        if let Some(user) = user {
            Ok(AuthenticatedUser(user))
        } else {
            Err(Error::Unauthorized)
        }
    }
}
