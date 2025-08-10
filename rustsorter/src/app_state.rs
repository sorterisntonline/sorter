use sqlx::PgPool;
use std::sync::Arc;
use crate::integrations::reddit::RedditClient;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub reddit_client: Arc<RedditClient>,
}
