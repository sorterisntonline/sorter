use aide::OperationIo;
use axum::{extract::FromRequestParts, http::request::Parts};

use crate::models::{Error, User};

#[derive(OperationIo)]
pub struct MaybeUser(pub Option<User>);

impl<S> FromRequestParts<S> for MaybeUser
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let user = parts.extensions.get::<User>().cloned();
        log::debug!("MaybeUser extractor found user: {:?}", user);
        Ok(MaybeUser(user))
    }
}

#[derive(OperationIo)]
pub struct AuthenticatedUser(pub User);

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
