use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub spotify_client_id: String,
    pub spotify_client_secret: String,
    pub base_url: String,
    pub frontend_url: String,
    pub admin_user_id: Uuid,
}
