use rspotify::ClientCredsSpotify;
use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub spotify_client: ClientCredsSpotify,
}
