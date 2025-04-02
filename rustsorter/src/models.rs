use uuid::Uuid;
use utoipa::ToSchema;

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone, ToSchema)]
pub struct User {
    pub id: Uuid,
    pub auth0_sub: String,
    pub username: String,
}