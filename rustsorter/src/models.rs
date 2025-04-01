use uuid::Uuid;

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub auth0_sub: String,
    pub username: String,
}