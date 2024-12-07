use std::{collections::HashSet, hash::Hash};

use actix_session::Session;
use actix_web::{delete, get, post, web, HttpResponse, Responder};

#[derive(serde::Deserialize, Debug)]
struct PermissionsParams {
    tag_id: i32,
}

#[derive(serde::Serialize, sqlx::FromRow)]
struct Permission {
    tag_id: i32,
    capability: String,
    user_id: String,
}

use crate::types::ErrorJson;

pub async fn insert_default_permissions(db: &sqlx::PgPool, tag_id: i32) {
    for perm in vec![
        Permission {
            tag_id: tag_id,
            capability: "view".to_string(),
            user_id: "all".to_string(),
        },
        Permission {
            tag_id: tag_id,
            capability: "vote".to_string(),
            user_id: "all".to_string(),
        },
        Permission {
            tag_id: tag_id,
            capability: "add".to_string(),
            user_id: "none".to_string(),
        },
    ] {
        sqlx::query!(
            "INSERT INTO perms (tag_id, capability, user_id) VALUES ($1, $2, $3)",
            tag_id,
            perm.capability,
            perm.user_id,
        )
        .execute(db)
        .await
        .unwrap();
    }
}

struct UsersInUsergroup {
    user_id: String,
    usergroup_id: String,
}

pub async fn can(
    action: &str,
    tag: &crate::tag::Tag,
    user_id: &Option<String>,
    db: &sqlx::PgPool,
) -> bool {
    let perms = sqlx::query_as!(Permission, "SELECT * FROM perms WHERE tag_id = $1", tag.id)
        .fetch_all(db)
        .await
        .unwrap();

    for perm in perms {
        if perm.capability != action {
            continue;
        }
        match &user_id {
            Some(user_id) => {
                if tag.owner == *user_id || perm.user_id == "all" {
                    return true;
                }
                let users = perm.user_id.split(".").collect::<HashSet<&str>>();

                if perm.capability == action && users.contains(user_id.as_str()) {
                    return true;
                } else if perm.capability == action {
                    let group_membership = sqlx::query_as!(UsersInUsergroup,
                        "SELECT * FROM users_in_usergroups WHERE user_id = $1 AND usergroup_id = $2",
                        user_id,
                        perm.user_id
                    )
                    .fetch_all(db)
                    .await
                    .unwrap();
                    if group_membership.len() > 0 {
                        return true;
                    }
                }
            }
            None => {
                if perm.capability == action && perm.user_id == "all" {
                    return true;
                }
            }
        }
    }
    return false;
}
