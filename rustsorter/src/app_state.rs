use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub steam_api_key: String,
    pub base_url: String,
    pub frontend_url: String,
}
