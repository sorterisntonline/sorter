use chrono::offset;

pub mod discord_bot;
pub mod feed;
pub mod frontpage;
pub mod pagerank;
pub mod pair;
pub mod perms;
pub mod tag;
pub mod tag2;
pub mod types;

pub struct AppState {
    pub db: sqlx::PgPool,
}
