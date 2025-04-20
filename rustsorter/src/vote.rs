use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid; // Import Uuid for voter_user_id

use crate::{
    app_state::AppState,
    models::{ErrorResponse, Json}, // Assuming models module exists for Json and ErrorResponse
    extractors::maybe_user::AuthenticatedUser,
};

// Represents a vote fetched from the database, matching the 'votes' table schema
#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct Vote {
    pub left_entity_pk_namespace: String,
    pub left_entity_pk: String,
    pub right_entity_pk_namespace: String,
    pub right_entity_pk: String,
    pub user_id: Uuid, // Database type is UUID
    pub magnitude: i32,      // Database type is INT
    pub attribute_id: i32,   // Database type is INT
}

// Represents the payload for creating a vote
#[derive(Deserialize, Debug)]
pub struct VotePayload {
    left_entity_pk_namespace: String,
    left_entity_pk: String,
    right_entity_pk_namespace: String,
    right_entity_pk: String,
    user_id: Uuid, // Assuming this is provided; could be derived from auth later
    magnitude: i32,
    attribute_id: i32,
}

// Represents the payload for updating only the magnitude of a vote
#[derive(Deserialize, Debug)]
pub struct UpdateVotePayload {
    magnitude: i32,
}

// --- Handler Functions ---

// POST / - Create a new vote
async fn create_vote(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<VotePayload>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    match sqlx::query_as!(
        Vote,
        r#"
        INSERT INTO votes (left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, magnitude, attribute_id, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, magnitude, attribute_id, user_id
        "#,
        payload.left_entity_pk_namespace,
        payload.left_entity_pk,
        payload.right_entity_pk_namespace,
        payload.right_entity_pk,
        payload.magnitude,
        payload.attribute_id,
        user.id
    )
    .fetch_one(&state.db)
    .await
    {
        Ok(vote) => Ok((StatusCode::CREATED, Json(vote))),
        Err(e) => {
            log::error!("Failed to create vote: {}", e);
            if let Some(db_err) = e.as_database_error() {
                if db_err.is_unique_violation() {
                    // Handle case where the exact same vote already exists
                    return Err(ErrorResponse::new(
                        StatusCode::CONFLICT,
                        "This vote already exists.".to_string(),
                    ));
                }
                if db_err.is_foreign_key_violation() {
                     // Handle cases where user, attribute, or entities don't exist
                     return Err(ErrorResponse::new(
                        StatusCode::BAD_REQUEST,
                        format!("Invalid reference: {}", db_err.constraint().unwrap_or("unknown foreign key")),
                    ));
                 }
            }
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create vote".to_string(),
            ))
        }
    }
}

// GET /:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:attr_id - Get a specific vote
async fn get_vote(
    State(state): State<AppState>,
    Path((left_ns, left_pk, right_ns, right_pk, user_id, attr_id)): Path<(
        String,
        String,
        String,
        String,
        Uuid, // Path param for user_id
        i32,  // Path param for attr_id
    )>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    match sqlx::query_as!(
        Vote,
        r#"
        SELECT left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, user_id, magnitude, attribute_id
        FROM votes
        WHERE left_entity_pk_namespace = $1
          AND left_entity_pk = $2
          AND right_entity_pk_namespace = $3
          AND right_entity_pk = $4
          AND user_id = $5
          AND attribute_id = $6
        "#,
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        user_id,
        attr_id
    )
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(vote)) => Ok((StatusCode::OK, Json(vote))),
        Ok(None) => Err(ErrorResponse::new(
            StatusCode::NOT_FOUND,
            "Vote not found".to_string(),
        )),
        Err(e) => {
            log::error!("Failed to get vote: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to retrieve vote".to_string(),
            ))
        }
    }
}

// GET / - List votes (Consider adding query parameters for filtering in production)
async fn list_votes(
    State(state): State<AppState>,
    // TODO: Add query parameters for filtering, e.g., axum::extract::Query<VoteFilterParams>
) -> Result<impl IntoResponse, impl IntoResponse> {
    // Warning: Fetches all votes. Implement filtering/pagination for real-world use.
    match sqlx::query_as!(
        Vote,
        r#"
        SELECT left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, user_id, magnitude, attribute_id
        FROM votes
        ORDER BY user_id, attribute_id, left_entity_pk_namespace, left_entity_pk  -- Example basic ordering
        "#
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(votes) => Ok((StatusCode::OK, Json(votes))),
        Err(e) => {
             log::error!("Failed to list votes: {}", e);
              Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to list votes".to_string(),
            ))
        }
    }
}

// PUT /:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:attr_id - Update an existing vote's magnitude
async fn update_vote(
    State(state): State<AppState>,
    Path((left_ns, left_pk, right_ns, right_pk, user_id, attr_id)): Path<(
        String,
        String,
        String,
        String,
        Uuid,
        i32,
    )>,
    Json(payload): Json<UpdateVotePayload>, // Only magnitude can be updated via this endpoint
) -> Result<impl IntoResponse, impl IntoResponse> {
    match sqlx::query_as!(
        Vote,
        r#"
        UPDATE votes
        SET magnitude = $7
        WHERE left_entity_pk_namespace = $1
          AND left_entity_pk = $2
          AND right_entity_pk_namespace = $3
          AND right_entity_pk = $4
          AND user_id = $5
          AND attribute_id = $6
        RETURNING left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, user_id, magnitude, attribute_id
        "#,
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        user_id,
        attr_id,
        payload.magnitude // The new magnitude from the payload
    )
    .fetch_optional(&state.db) // Use fetch_optional to check if the row existed before update
    .await
    {
        Ok(Some(vote)) => Ok((StatusCode::OK, Json(vote))),
        Ok(None) => Err(ErrorResponse::new( // If fetch_optional is None, the row wasn't found
            StatusCode::NOT_FOUND,
            "Vote not found".to_string(),
        )),
        Err(e) => {
            log::error!("Failed to update vote: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to update vote".to_string(),
            ))
        }
    }
}

// DELETE /:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:attr_id - Delete a vote
async fn delete_vote(
    State(state): State<AppState>,
    Path((left_ns, left_pk, right_ns, right_pk, user_id, attr_id)): Path<(
        String,
        String,
        String,
        String,
        Uuid,
        i32,
    )>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    match sqlx::query!(
        r#"
        DELETE FROM votes
        WHERE left_entity_pk_namespace = $1
          AND left_entity_pk = $2
          AND right_entity_pk_namespace = $3
          AND right_entity_pk = $4
          AND user_id = $5
          AND attribute_id = $6
        "#,
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        user_id,
        attr_id
    )
    .execute(&state.db)
    .await
    {
        Ok(result) => {
            if result.rows_affected() > 0 {
                Ok(StatusCode::NO_CONTENT) // Standard response for successful DELETE
            } else {
                 Err(ErrorResponse::new( // If no rows affected, the vote didn't exist
                    StatusCode::NOT_FOUND,
                    "Vote not found".to_string(),
                ))
            }
        }
        Err(e) => {
            log::error!("Failed to delete vote: {}", e);
            Err(ErrorResponse::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to delete vote".to_string(),
            ))
        }
    }
}

// Define the routes for vote CRUD operations
pub fn routes() -> Router<AppState> {
    Router::new()
        // Route for creating and listing votes
        .route("/", post(create_vote).get(list_votes))
        // Route for getting, updating (magnitude), and deleting a specific vote
        // Uses the composite primary key fields as path parameters
        .route(
            "/:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:attr_id",
            get(get_vote).put(update_vote).delete(delete_vote),
        )
}
