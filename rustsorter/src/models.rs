use serde::{Deserialize, Serialize};

pub struct AppState {
    pub db: sqlx::PgPool,
}

#[derive(sqlx::FromRow, Debug, serde::Serialize)]
pub struct Tag {
    pub id: i32,
    pub owner: String,
    pub title: String,
    pub slug: String,
    pub description: Option<String>,
    pub domain_pk: Option<String>,
    pub domain_pk_namespace: Option<String>,
    pub domain_url: Option<String>,
    pub ns: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub edited_at: chrono::NaiveDateTime,
    pub unlisted: bool,
    pub nsfw: bool,
    pub hide_item_authors: bool,
}

#[derive(sqlx::FromRow, Debug)]
pub struct ItemsInTag {
    item_id: i32,
    tag_id: i32,
    status: i32,
}

#[derive(sqlx::FromRow, Debug, serde::Serialize, Clone)]
pub struct Item {
    pub id: i32,
    pub owner: String,
    pub title: String,
    pub slug: String,
    pub body: Option<String>,
    pub domain_pk: Option<String>,
    pub domain_pk_namespace: Option<String>,
    pub url: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub edited_at: chrono::NaiveDateTime,

    #[sqlx(default)]
    pub num_comments: Option<i64>,
}

#[derive(Debug, serde::Serialize, Clone, PartialEq)]
pub struct SortedItem {
    pub id: i32,
    pub owner: String,
    pub title: String,
    pub slug: String,
    pub body: Option<String>,
    pub domain_pk: Option<String>,
    pub domain_pk_namespace: Option<String>,
    pub url: Option<String>,
    pub created_at: chrono::NaiveDateTime,
    pub edited_at: chrono::NaiveDateTime,
    pub elo: f32,
    pub vote_count: i32,

    pub num_comments: Option<i64>,
}

impl From<SortedItem> for Item {
    fn from(item: SortedItem) -> Self {
        Item {
            id: item.id,
            owner: item.owner,
            title: item.title,
            slug: item.slug,
            body: item.body,
            domain_pk: item.domain_pk,
            domain_pk_namespace: item.domain_pk_namespace,
            url: item.url,
            created_at: item.created_at,
            edited_at: item.edited_at,
            num_comments: item.num_comments,
        }
    }
}

#[derive(sqlx::FromRow, Debug, serde::Serialize, Clone)]
pub struct Vote {
    pub id: i32,
    pub owner: String,
    pub left_item_id: i32,
    pub right_item_id: i32,
    pub magnitude: i32,
    pub attribute: i32,

    pub created_at: chrono::NaiveDateTime,
    pub edited_at: chrono::NaiveDateTime,
}

#[derive(sqlx::FromRow, Debug)]
pub struct Skip {
    pub owner: String,
    pub item_id: i32,
}

#[derive(serde::Serialize)]
pub struct Perms {
    pub can_vote: bool,
    pub can_add: bool,
    pub can_view: bool,
}

#[derive(sqlx::FromRow, serde::Serialize, Debug)]
pub struct Attribute {
    pub id: i32,
    pub owner: String,

    pub title: String,
    pub description: Option<String>,

    pub created_at: chrono::NaiveDateTime,
    pub edited_at: chrono::NaiveDateTime,

    #[sqlx(default)]
    pub votes: i32,
}

#[derive(sqlx::FromRow, serde::Serialize, Debug, Clone)]
pub struct User {
    pub user_name: String,

    #[sqlx(default)]
    pub email: Option<String>,

    #[sqlx(default)]
    pub email_verified: Option<bool>,
}