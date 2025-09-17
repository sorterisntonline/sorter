use sqlx::PgPool;

use crate::rama_client::RamaClient;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub rama: Option<RamaClient>,
}

impl AppState {
    pub fn new(db: PgPool, rama: Option<RamaClient>) -> Self {
        Self { db, rama }
    }
}
