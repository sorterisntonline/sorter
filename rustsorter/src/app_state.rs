use sqlx::PgPool;
use rspotify::ClientCredsSpotify;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub spotify_client: ClientCredsSpotify,
}