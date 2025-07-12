use aide::{OperationInput, OperationIo, transform::TransformOperation};
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

pub struct AuthenticatedUser(pub User);

impl OperationInput for AuthenticatedUser {
    fn operation_input(
        _ctx: &mut aide::generate::GenContext,
        operation: &mut aide::openapi::Operation,
    ) {
        let _ = TransformOperation::new(operation).security_requirement("ApiKey");
    }
}

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
