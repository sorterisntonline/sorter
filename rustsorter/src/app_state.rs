use rspotify::ClientCredsSpotify;
use sqlx::PgPool;
use crate::models::User;
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub spotify_client: ClientCredsSpotify,
    pub spotify_user: User,
}

