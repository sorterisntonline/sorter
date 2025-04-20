use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use chrono::{DateTime, Utc};
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
    pub user_id: Uuid,       // Database type is UUID
    pub magnitude: i32,      // Database type is INT
    pub attribute_id: i32,   // Database type is INT
    pub created_at: DateTime<Utc>, // Added created_at timestamp
}

// Represents the payload for creating a vote
#[derive(Deserialize, Debug)]
pub struct VotePayload {
    left_entity_pk_namespace: String,
    left_entity_pk: String,
    right_entity_pk_namespace: String,
    right_entity_pk: String,
    magnitude: i32,
    attribute_id: i32,
}

// --- Handler Functions ---

// POST / - Create a new vote
async fn create_vote(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<VotePayload>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    // Ensure the left/right pair is ordered correctly before insertion
    // If not, swap them to match the CHECK constraint
    let (left_ns, left_pk, right_ns, right_pk, magnitude) =
        if (payload.left_entity_pk_namespace.clone(), payload.left_entity_pk.clone()) <
           (payload.right_entity_pk_namespace.clone(), payload.right_entity_pk.clone())
        {
            (
                payload.left_entity_pk_namespace,
                payload.left_entity_pk,
                payload.right_entity_pk_namespace,
                payload.right_entity_pk,
                payload.magnitude, // Keep original magnitude if left < right
            )
        } else {
            (
                payload.right_entity_pk_namespace, // Swap
                payload.right_entity_pk,           // Swap
                payload.left_entity_pk_namespace,  // Swap
                payload.left_entity_pk,            // Swap
                -payload.magnitude,                // Invert magnitude if swapped
            )
        };

    match sqlx::query_as!(
        Vote,
        r#"
        INSERT INTO votes (left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, magnitude, attribute_id, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        -- The RETURNING clause now includes created_at
        RETURNING left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, magnitude, attribute_id, user_id, created_at as "created_at: DateTime<Utc>"
        "#,
        left_ns, // Use potentially swapped values
        left_pk,
        right_ns,
        right_pk,
        magnitude, // Use potentially inverted magnitude
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
                // If the PK includes created_at, unique violations on the original composite key
                // might indicate trying to vote again *at the exact same microsecond*,
                // which is unlikely but possible. Or the PK might still enforce uniqueness
                // on (pair, user, attribute) if created_at wasn't added to the PK.
                // The error handling logic might need adjustment depending on the exact final schema.
                if db_err.is_unique_violation() {
                    return Err(ErrorResponse::new(
                        StatusCode::CONFLICT,
                        // Consider a more nuanced message depending on the exact PK constraint
                        "This vote might already exist or conflict with constraints.".to_string(),
                    ));
                }
                 if db_err.is_check_violation() {
                     // Handle the CHECK constraint violation specifically
                     return Err(ErrorResponse::new(
                        StatusCode::BAD_REQUEST,
                        "Vote violates check constraint (likely incorrect entity pair ordering).".to_string(),
                    ));
                 }
                if db_err.is_foreign_key_violation() {
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

// GET /:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:attr_id - Get a specific vote *instance*
// NOTE: This route might need reconsideration. If multiple votes can exist for the same
// composite key (due to created_at), this will only return the *latest* one based on ordering.
// You might want to list votes filtered by these params instead, or add created_at to the path.
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
     // Ensure the path parameters are ordered correctly for the query
     let (query_left_ns, query_left_pk, query_right_ns, query_right_pk) =
        if (left_ns.clone(), left_pk.clone()) < (right_ns.clone(), right_pk.clone()) {
            (left_ns, left_pk, right_ns, right_pk)
        } else {
             log::warn!("Request path for get_vote received non-canonical order for pair ({}/{}), ({}/{}), potential client error.", left_ns, left_pk, right_ns, right_pk);
             // Proceed with the potentially swapped order as requested, but log it.
             // Alternatively, return BadRequest or automatically query canonical order.
            (left_ns, left_pk, right_ns, right_pk) // Or swap them: (right_ns, right_pk, left_ns, left_pk)
        };


    match sqlx::query_as!(
        Vote,
        r#"
        SELECT left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, user_id, magnitude, attribute_id, created_at as "created_at: DateTime<Utc>" -- Added created_at with type hint
        FROM votes
        WHERE left_entity_pk_namespace = $1
          AND left_entity_pk = $2
          AND right_entity_pk_namespace = $3
          AND right_entity_pk = $4
          AND user_id = $5
          AND attribute_id = $6
        ORDER BY created_at DESC -- If multiple votes match, return the latest
        LIMIT 1 -- Return only one (the latest)
        "#,
        query_left_ns, // Use potentially ordered params
        query_left_pk,
        query_right_ns,
        query_right_pk,
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
        SELECT left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, user_id, magnitude, attribute_id, created_at as "created_at: DateTime<Utc>" -- Added created_at with type hint
        FROM votes
        ORDER BY created_at DESC -- Example ordering by creation time
        "# // Consider adding user_id, attribute_id etc. to ORDER BY
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

// Define the routes for vote operations (now only create and read)
pub fn routes() -> Router<AppState> {
    Router::new()
        // Route for creating and listing votes
        .route("/", post(create_vote).get(list_votes))
        // Route for getting a specific vote (or the latest instance of it)
        // Uses the composite key fields as path parameters
        .route(
            "/:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:attr_id",
            get(get_vote), // Only GET is supported now
                           // REMOVED: .put(update_vote).delete(delete_vote)
        )
}
