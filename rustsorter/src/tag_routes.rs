use axum::{
    async_trait, // If needed
    extract::{State, Path, Json, Extension}, // Axum extractors
    response::{IntoResponse, Response}, // Axum response types
    routing::{get, post, put, delete}, // Axum routing methods
    http::StatusCode, // HTTP status codes
    Router, // Axum router
};
use axum::http::Request; // For request extensions if needed directly
use sqlx::PgPool;

use crate::app_state::AppState;
use crate::models::{Tag, User};
use crate::perms;

// --- Payload Structs (Optional but good practice) ---
// Although we added Deserialize to Tag, defining specific payloads
// can provide better control over what fields are expected for each operation.
// For now, we'll use the Tag struct directly for create/update payloads.
// type CreateTagPayload = Tag; // Example if we used a specific struct
// type UpdateTagPayload = Tag; // Example

// --- Define a custom Error type for Tag routes ---
// This makes error handling cleaner than using actix_web::error directly
#[derive(Debug)]
enum TagError {
    SqlxError(sqlx::Error),
    NotFound,
    Forbidden(String),
    Conflict(String),
    InternalError(String),
    Unauthorized, // Added for consistency if get_user fails
}

// Implement IntoResponse for TagError
impl IntoResponse for TagError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            TagError::NotFound => (StatusCode::NOT_FOUND, "Tag not found".to_string()),
            TagError::Forbidden(m) => (StatusCode::FORBIDDEN, m),
            TagError::Conflict(m) => (StatusCode::CONFLICT, m),
            TagError::Unauthorized => (StatusCode::UNAUTHORIZED, "Unauthorized".to_string()),
            TagError::SqlxError(e) => {
                log::error!("SQLx error in tag route: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
            },
            TagError::InternalError(m) => {
                log::error!("Internal error in tag route: {}", m);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            },
        };
        (status, axum::Json(serde_json::json!({"error": msg}))).into_response()
    }
}

// Implement From<sqlx::Error> for TagError
impl From<sqlx::Error> for TagError {
    fn from(err: sqlx::Error) -> Self {
        // You could add more specific checks here, e.g., for unique constraints
        TagError::SqlxError(err)
    }
}

// --- Route Handlers ---

async fn create_tag(
    State(state): State<AppState>,
    Extension(user): Extension<User>, // Get user from extensions
    Json(mut tag_payload): Json<Tag>, // Axum
) -> Result<impl IntoResponse, TagError> {
    // Set owner from authenticated user
    tag_payload.owner = user.user_name.clone();
    // Ensure defaults are respected (though DB defaults might handle some)
    tag_payload.id = 0; // Ignored by DB anyway
    let now = chrono::Utc::now().naive_utc();
    tag_payload.created_at = now;
    tag_payload.edited_at = now;

    // Insert into database
    let result = sqlx::query_as!(
        Tag,
        r#"
        INSERT INTO tags (owner, title, slug, description, domain_pk, domain_pk_namespace, domain_url, ns, unlisted, nsfw, hide_item_authors)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, owner, title, slug, description, domain_pk, domain_pk_namespace, domain_url, ns, created_at, edited_at, unlisted, nsfw, hide_item_authors
        "#,
        tag_payload.owner,
        tag_payload.title,
        tag_payload.slug,
        tag_payload.description,
        tag_payload.domain_pk,
        tag_payload.domain_pk_namespace,
        tag_payload.domain_url,
        tag_payload.ns,
        tag_payload.unlisted,
        tag_payload.nsfw,
        tag_payload.hide_item_authors
    )
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(new_tag) => {
            // Insert default permissions for the new tag
            // TODO make this return error correctly
            perms::insert_default_permissions(&state.db, new_tag.id).await;
            Ok((StatusCode::CREATED, axum::Json(new_tag)))
        },
        Err(e) => {
            // Handle potential errors like unique constraint violation on slug
             if let Some(db_err) = e.as_database_error() {
                if db_err.constraint() == Some("tags_owner_slug_key") {
                    return Err(TagError::Conflict("Slug already exists for this owner.".to_string()));
                }
            }
            Err(TagError::InternalError("Failed to create tag".to_string()))
        }
    }
}

async fn get_tag(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(tag_id): Path<i32>,
) -> Result<impl IntoResponse, TagError> {
    let tag = sqlx::query_as!(Tag, "SELECT * FROM tags WHERE id = $1", tag_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            log::error!("Failed to fetch tag {}: {}", tag_id, e);
            TagError::SqlxError(e)
        })?;

    match tag {
        Some(t) => {
            let can_view = perms::can("view", &t, &Some(user.user_name), &state.db).await;
            if can_view {
                Ok(axum::Json(t))
            } else {
                // Return Not Found instead of Forbidden to avoid leaking existence
                Err(TagError::NotFound)
            }
        }
        None => Err(TagError::NotFound),
    }
}

async fn update_tag(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(tag_id): Path<i32>,
    update_payload: Json<Tag>, // Using Tag directly for simplicity now
) -> Result<impl IntoResponse, TagError> {

    // Fetch the existing tag first to check ownership
    let existing_tag = sqlx::query_as!(Tag, "SELECT * FROM tags WHERE id = $1", tag_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            log::error!("Failed to fetch tag for update {}: {}", tag_id, e);
            TagError::SqlxError(e)
        })?;

     match existing_tag {
        Some(tag) => {
             // Check ownership
            if tag.owner != user.user_name {
                log::warn!("User {} attempted to update tag {} owned by {}", user.user_name, tag_id, tag.owner);
                return Err(TagError::Forbidden("You do not own this tag".to_string()));
            }

            // Perform the update
            let updated_tag = sqlx::query_as!(
                Tag,
                r#"
                UPDATE tags
                SET title = $1, slug = $2, description = $3, domain_pk = $4,
                    domain_pk_namespace = $5, domain_url = $6, ns = $7,
                    unlisted = $8, nsfw = $9, hide_item_authors = $10,
                    edited_at = NOW()
                WHERE id = $11
                RETURNING id, owner, title, slug, description, domain_pk, domain_pk_namespace, domain_url, ns, created_at, edited_at, unlisted, nsfw, hide_item_authors
                "#,
                update_payload.title,
                update_payload.slug,
                update_payload.description,
                update_payload.domain_pk,
                update_payload.domain_pk_namespace,
                update_payload.domain_url,
                update_payload.ns,
                update_payload.unlisted,
                update_payload.nsfw,
                update_payload.hide_item_authors,
                tag_id
            )
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                log::error!("Failed to update tag {}: {}", tag_id, e);
                 // Handle potential errors like unique constraint violation on slug
                 if let Some(db_err) = e.as_database_error() {
                    if db_err.constraint() == Some("tags_owner_slug_key") {
                        // Use actix_web::error::ErrorConflict which results in a 409
                        return TagError::Conflict("Slug already exists for this owner.".to_string())
                    }
                 }
                return TagError::InternalError("Failed to update tag".to_string())
            })?;

            Ok(axum::Json(updated_tag))

        }
        None => Err(TagError::NotFound),
    }
}


async fn delete_tag(
    State(state): State<AppState>,
    Extension(user): Extension<User>,
    Path(tag_id): Path<i32>,
) -> Result<impl IntoResponse, TagError> {

     // Fetch the existing tag first to check ownership
    let existing_tag = sqlx::query_as!(Tag, "SELECT * FROM tags WHERE id = $1", tag_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            log::error!("Failed to fetch tag for delete {}: {}", tag_id, e);
            TagError::SqlxError(e)
        })?;

    match existing_tag {
        Some(tag) => {
             // Check ownership
            if tag.owner != user.user_name {
                log::warn!("User {} attempted to delete tag {} owned by {}", user.user_name, tag_id, tag.owner);
                 return Err(TagError::Forbidden("You do not own this tag".to_string()));
            }

            // TODO: Consider what to do with items/permissions associated with this tag.
            // For now, we just delete the tag row. Deleting permissions might be good.
            // Deleting associated ItemsInTag rows might also be necessary depending on FK constraints.

            let delete_perms_result = sqlx::query!("DELETE FROM perms WHERE tag_id = $1", tag_id)
                .execute(&state.db)
                .await;
             if let Err(e) = delete_perms_result {
                 log::error!("Failed to delete permissions for tag {}: {}", tag_id, e);
                 // Decide if this should be a hard error or just logged
            }

            let delete_tag_result = sqlx::query!("DELETE FROM tags WHERE id = $1", tag_id)
                .execute(&state.db)
                .await;

            match delete_tag_result {
                // Use `execute` which returns rows_affected
                Ok(result) if result.rows_affected() > 0 => {
                    Ok(axum::Json(serde_json::json!({"status": "success"})))
                }
                Ok(_) => {
                    // Tag might have been deleted between fetch and delete, or ID was invalid initially
                    Ok(axum::Json(serde_json::json!({"error": "Tag not found"})))
                }
                Err(e) => {
                    log::error!("Failed to delete tag {}: {}", tag_id, e);
                    Err(TagError::InternalError("Failed to delete tag".to_string()))
                }
            }
        }
         None => Err(TagError::NotFound),
    }
}


// --- Configuration Function ---
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_tag)) // POST to root for creation
        .route("/:tag_id", get(get_tag).put(update_tag).delete(delete_tag)) // Routes with tag_id path param
} 