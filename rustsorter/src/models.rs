
#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone)]
pub struct User {
    pub auth0_sub: String,
    pub username: String,
}