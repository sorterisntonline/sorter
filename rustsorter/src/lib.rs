pub struct AppState {
    pub db: sqlx::PgPool,
}

pub mod tag;
pub mod pagerank;
pub mod pair;
pub mod perms;
pub mod models;
pub mod api_key;