use sqlx::PgPool;
use std::sync::Arc;
use crate::integrations::reddit::RedditApi;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub reddit_client: Arc<dyn RedditApi>,
}
