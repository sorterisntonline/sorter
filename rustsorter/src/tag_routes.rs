use actix_web::{web, HttpRequest, HttpResponse, Responder, Scope, get, post, put, delete, HttpMessage};
use actix_web::http::StatusCode;
use actix_web::error;
use sqlx::PgPool;

use crate::models::{AppState, Tag, User};
use crate::perms;

// --- Payload Structs (Optional but good practice) ---
// Although we added Deserialize to Tag, defining specific payloads
// can provide better control over what fields are expected for each operation.
// For now, we'll use the Tag struct directly for create/update payloads.
// type CreateTagPayload = Tag; // Example if we used a specific struct
// type UpdateTagPayload = Tag; // Example

// --- Helper Function to Get User ---
fn get_user(req: &HttpRequest) -> Result<User, error::Error> {
    req.extensions()
        .get::<User>()
        .cloned()
        .ok_or_else(|| error::ErrorInternalServerError("User data not found after authentication"))
}

// --- Route Handlers ---

#[post("")]
async fn create_tag(
    req: HttpRequest,
    state: web::Data<AppState>,
    mut tag_payload: web::Json<Tag>,
) -> Result<HttpResponse, error::Error> {
    let user = get_user(&req)?;

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
            perms::insert_default_permissions(&state.db, new_tag.id).await;
            Ok(HttpResponse::Created().json(new_tag))
        },
        Err(e) => {
            log::error!("Failed to create tag: {}", e);
            // Handle potential errors like unique constraint violation on slug
             if let Some(db_err) = e.as_database_error() {
                if db_err.constraint() == Some("tags_owner_slug_key") {
                    return Ok(HttpResponse::Conflict().json(serde_json::json!({"error": "Slug already exists for this owner."})));
                }
            }
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to create tag"})))
        }
    }
}

#[get("/{tag_id}")]
async fn get_tag(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<i32>,
) -> Result<HttpResponse, error::Error> {
    let user = get_user(&req)?;
    let tag_id = path.into_inner();

    let tag = sqlx::query_as!(Tag, "SELECT * FROM tags WHERE id = $1", tag_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            log::error!("Failed to fetch tag {}: {}", tag_id, e);
            error::ErrorInternalServerError("Failed to fetch tag")
        })?;

    match tag {
        Some(t) => {
            let can_view = perms::can("view", &t, &Some(user.user_name), &state.db).await;
            if can_view {
                Ok(HttpResponse::Ok().json(t))
            } else {
                // Return Not Found instead of Forbidden to avoid leaking existence
                Ok(HttpResponse::NotFound().finish())
            }
        }
        None => Ok(HttpResponse::NotFound().finish()),
    }
}

#[put("/{tag_id}")]
async fn update_tag(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<i32>,
    update_payload: web::Json<Tag>, // Using Tag directly for simplicity now
) -> Result<HttpResponse, error::Error> {
    let user = get_user(&req)?;
    let tag_id = path.into_inner();

    // Fetch the existing tag first to check ownership
    let existing_tag = sqlx::query_as!(Tag, "SELECT * FROM tags WHERE id = $1", tag_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            log::error!("Failed to fetch tag for update {}: {}", tag_id, e);
            error::ErrorInternalServerError("Failed to fetch tag")
        })?;

     match existing_tag {
        Some(tag) => {
             // Check ownership
            if tag.owner != user.user_name {
                log::warn!("User {} attempted to update tag {} owned by {}", user.user_name, tag_id, tag.owner);
                return Ok(HttpResponse::Forbidden().json(serde_json::json!({"error": "You do not own this tag"})));
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
                        return error::ErrorConflict("Slug already exists for this owner.");
                    }
                 }
                error::ErrorInternalServerError("Failed to update tag")
            })?;

            Ok(HttpResponse::Ok().json(updated_tag))

        }
        None => Ok(HttpResponse::NotFound().finish()),
    }
}


#[delete("/{tag_id}")]
async fn delete_tag(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<i32>,
) -> Result<HttpResponse, error::Error> {
    let user = get_user(&req)?;
    let tag_id = path.into_inner();

     // Fetch the existing tag first to check ownership
    let existing_tag = sqlx::query_as!(Tag, "SELECT * FROM tags WHERE id = $1", tag_id)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| {
            log::error!("Failed to fetch tag for delete {}: {}", tag_id, e);
            error::ErrorInternalServerError("Failed to fetch tag")
        })?;

    match existing_tag {
        Some(tag) => {
             // Check ownership
            if tag.owner != user.user_name {
                log::warn!("User {} attempted to delete tag {} owned by {}", user.user_name, tag_id, tag.owner);
                 return Ok(HttpResponse::Forbidden().json(serde_json::json!({"error": "You do not own this tag"})));
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
                    Ok(HttpResponse::Ok().finish()) // Or HttpResponse::NoContent()
                }
                Ok(_) => {
                    // Tag might have been deleted between fetch and delete, or ID was invalid initially
                    Ok(HttpResponse::NotFound().finish())
                }
                Err(e) => {
                    log::error!("Failed to delete tag {}: {}", tag_id, e);
                    Ok(HttpResponse::InternalServerError().json(serde_json::json!({"error": "Failed to delete tag"})))
                }
            }
        }
         None => Ok(HttpResponse::NotFound().finish()),
    }
}


// --- Configuration Function ---
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/tags") // Base path for tag routes
            .service(create_tag)
            .service(get_tag)
            .service(update_tag)
            .service(delete_tag)
    );
} 