use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Router,
    extract::Query,
    debug_handler,
    response::Response,
    body::Body,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid;

use crate::{
    app_state::AppState, entity::Entity, entity_relationships::EntityRelationship, models::{ErrorResponse, Json}
};

// Represents a vote fetched from the database, matching the refactored 'votes' table schema
#[derive(Serialize, Debug, sqlx::FromRow)]
pub struct Vote {
    pub id: Uuid,                           // votes.id
    pub left_entity_pk_namespace: String,   // votes.left_entity_pk_namespace  
    pub left_entity_pk: String,             // votes.left_entity_pk
    pub right_entity_pk_namespace: String,  // votes.right_entity_pk_namespace
    pub right_entity_pk: String,            // votes.right_entity_pk
    pub voter_user_id: Uuid,                // votes.voter_user_id
    pub score: i32,                         // votes.score (renamed from magnitude)
    pub lens_entity_pk_namespace: String,   // votes.lens_entity_pk_namespace
    pub lens_entity_pk: String,             // votes.lens_entity_pk
    pub tag_entity_pk_namespace: String,    // votes.tag_entity_pk_namespace  
    pub tag_entity_pk: String,              // votes.tag_entity_pk
    pub rationale: Option<String>,          // votes.rationale
    pub created_at: DateTime<Utc>,          // votes.created_at
}

// Represents the payload for creating a vote (updated for new schema)
#[derive(Deserialize, Debug)]
pub struct VotePayload {
    left_entity_pk_namespace: String,
    left_entity_pk: String,
    right_entity_pk_namespace: String,
    right_entity_pk: String,
    score: i32,                          // renamed from magnitude
    lens_entity_pk_namespace: String,    // new field
    lens_entity_pk: String,              // replaces attribute_id
    tag_entity_pk_namespace: String,     // new field
    tag_entity_pk: String,               // new field for tag context
    rationale: Option<String>,           // new optional field
}

// --- Handler Functions ---

// POST / - Create a new vote
#[debug_handler]
async fn create_vote(
    State(state): State<AppState>,
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
                payload.score, // Keep original magnitude if left < right
            )
        } else {
            (
                payload.right_entity_pk_namespace, // Swap
                payload.right_entity_pk,           // Swap
                payload.left_entity_pk_namespace,  // Swap
                payload.left_entity_pk,            // Swap
                -payload.score,                // Invert magnitude if swapped
            )
        };

    match sqlx::query_as!(
        Vote,
        r#"
        INSERT INTO votes (left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, score, lens_entity_pk_namespace, lens_entity_pk, tag_entity_pk_namespace, tag_entity_pk, rationale, voter_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, score, lens_entity_pk_namespace, lens_entity_pk, tag_entity_pk_namespace, tag_entity_pk, rationale, voter_user_id, created_at
        "#,
        left_ns, // Use potentially swapped values
        left_pk,
        right_ns,
        right_pk,
        magnitude, // Use potentially inverted magnitude
        payload.lens_entity_pk_namespace,
        payload.lens_entity_pk,
        payload.tag_entity_pk_namespace,
        payload.tag_entity_pk,
        payload.rationale,
        state.spotify_user.id // TODO: Use authenticated user @chris
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

// GET /:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:lens_pk/:tag_pk - Get a specific vote *instance*
async fn get_vote(
    State(state): State<AppState>,
    Path((left_ns, left_pk, right_ns, right_pk, user_id, lens_pk, tag_pk)): Path<(
        String,
        String,
        String,
        String,
        Uuid,   // Path param for voter_user_id
        String, // Path param for lens_entity_pk
        String, // Path param for tag_entity_pk
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
        SELECT id, left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, score, lens_entity_pk_namespace, lens_entity_pk, tag_entity_pk_namespace, tag_entity_pk, rationale, voter_user_id, created_at
        FROM votes
        WHERE left_entity_pk_namespace = $1
          AND left_entity_pk = $2
          AND right_entity_pk_namespace = $3
          AND right_entity_pk = $4
          AND voter_user_id = $5
          AND lens_entity_pk = $6
          AND tag_entity_pk = $7
        ORDER BY created_at DESC -- If multiple votes match, return the latest
        LIMIT 1 -- Return only one (the latest)
        "#,
        query_left_ns, // Use potentially ordered params
        query_left_pk,
        query_right_ns,
        query_right_pk,
        user_id,
        lens_pk,
        tag_pk
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

// GET / - List votes
#[derive(Deserialize, Debug)]
struct VoteFilterParams {
    user_id: Option<Uuid>,
    attribute_id: Option<i32>,
    parent_entity_ns: Option<String>,
    parent_entity_pk: Option<String>,
}
async fn list_votes(
    Query(params): Query<VoteFilterParams>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    let childen_of_parent : Vec<EntityRelationship> = sqlx::query_as!(
        EntityRelationship,
        r#"
        SELECT * FROM entity_relationships WHERE parent_pk_namespace = $1 AND parent_pk = $2
        "#,
        params.parent_entity_ns,
        params.parent_entity_pk
    )
    .fetch_all(&state.db)
    .await.map_err(|e| {
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to list votes".to_string())
    })?;


    let child_pk_namespaces = childen_of_parent.iter().map(|r| r.child_pk_namespace.clone()).collect::<Vec<String>>();
    let votes = sqlx::query_as!(
        Vote,
        r#"
        SELECT id, left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, score, lens_entity_pk_namespace, lens_entity_pk, tag_entity_pk_namespace, tag_entity_pk, rationale, voter_user_id, created_at
        FROM votes 
        WHERE true 
        ORDER BY created_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await.map_err(|e| {
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to list votes".to_string())
    })?;


    let response  : Result<Response<Body>, ErrorResponse> = Ok(Json(votes).into_response());
    response
}

// Define the routes for vote operations (now only create and read)
pub fn routes() -> Router<AppState> {
    Router::new()
        // Route for creating and listing votes
        .route("/", post(create_vote).get(list_votes))
        // Route for getting a specific vote (or the latest instance of it)
        // Uses the composite key fields as path parameters
        .route(
            "/:left_ns/:left_pk/:right_ns/:right_pk/:user_id/:lens_pk/:tag_pk",
            get(get_vote), // Only GET is supported now
                           // REMOVED: .put(update_vote).delete(delete_vote)
        )
}
