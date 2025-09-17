use aide::axum::{ApiRouter, routing::{get_with, post_with}};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::{NaiveDateTime};
use log::debug;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{PgExecutor, query_as, query_file_as};
use uuid::Uuid;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, IntoNotFound, Json, MapErrorSqlx, PgAcquire},
};

// ============================================================================
// DATA STRUCTURES
// ============================================================================

#[derive(Serialize, Debug, sqlx::FromRow, Clone, JsonSchema)]
pub struct TagCollection {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub creator_user_id: Uuid,
    pub valid_from: NaiveDateTime,
    pub valid_to: Option<NaiveDateTime>,
    pub transaction_time: NaiveDateTime,
    #[sqlx(json)]
    pub metadata: Option<JsonValue>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Serialize, Debug, sqlx::FromRow, Clone, JsonSchema)]
pub struct TagClaim {
    pub id: Uuid,
    pub collection_id: Uuid,
    pub slug: String,
    pub valid_from: NaiveDateTime,
    pub valid_to: Option<NaiveDateTime>,
    pub transaction_time: NaiveDateTime,
    pub vote_count: i32,
    pub vote_score: f64,
    pub last_vote_at: Option<NaiveDateTime>,
    pub min_voter_reputation: i32,
    pub requires_approval: bool,
    pub status: String,
    #[sqlx(json)]
    pub metadata: Option<JsonValue>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Serialize, Debug, sqlx::FromRow, Clone, JsonSchema)]
pub struct CollectionMembership {
    pub id: Uuid,
    pub collection_id: Uuid,
    pub entity_pk_namespace: String,
    pub entity_pk: String,
    pub valid_from: NaiveDateTime,
    pub valid_to: Option<NaiveDateTime>,
    pub transaction_time: NaiveDateTime,
    pub vote_count: i32,
    pub vote_score: f64,
    pub last_vote_at: Option<NaiveDateTime>,
    pub justification: Option<String>,
    pub confidence_score: Option<f64>,
    pub added_by_user_id: Option<Uuid>,
    #[sqlx(json)]
    pub metadata: Option<JsonValue>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Serialize, Debug, sqlx::FromRow, Clone, JsonSchema)]
pub struct TagCollectionVote {
    pub id: Uuid,
    pub slug: String,
    pub left_collection_id: Uuid,
    pub right_collection_id: Uuid,
    pub user_id: Uuid,
    pub magnitude: i32,
    pub attribute_id: i32,
    pub valid_from: NaiveDateTime,
    pub valid_to: Option<NaiveDateTime>,
    pub transaction_time: NaiveDateTime,
    pub reason: Option<String>,
    #[sqlx(json)]
    pub metadata: Option<JsonValue>,
    pub created_at: NaiveDateTime,
}

#[derive(Serialize, Debug, sqlx::FromRow, Clone, JsonSchema)]
pub struct UserFolksonomyReputation {
    pub user_id: Uuid,
    pub tag_creation_reputation: i32,
    pub voting_reputation: i32,
    pub curation_reputation: i32,
    pub total_reputation: i32,
    pub collections_created: i32,
    pub votes_cast: i32,
    pub successful_challenges: i32,
    pub failed_challenges: i32,
    pub valid_from: NaiveDateTime,
    pub valid_to: Option<NaiveDateTime>,
    pub transaction_time: NaiveDateTime,
    #[sqlx(json)]
    pub metadata: Option<JsonValue>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Serialize, Debug, sqlx::FromRow, Clone, JsonSchema)]
pub struct SlugResolution {
    pub slug: String,
    pub winning_collection_id: Uuid,
    pub total_votes: i32,
    pub winning_score: f64,
    pub runner_up_collection_id: Option<Uuid>,
    pub runner_up_score: Option<f64>,
    pub margin_of_victory: Option<f64>,
    pub resolved_at: NaiveDateTime,
    pub last_challenge_at: Option<NaiveDateTime>,
    pub next_review_at: Option<NaiveDateTime>,
    pub is_disputed: bool,
    pub dispute_threshold_met: bool,
    #[sqlx(json)]
    pub metadata: Option<JsonValue>,
    pub updated_at: NaiveDateTime,
}

// ============================================================================
// REQUEST/RESPONSE PAYLOADS
// ============================================================================

#[derive(Deserialize, Debug, JsonSchema)]
pub struct CreateTagCollectionPayload {
    pub name: String,
    pub description: Option<String>,
    pub metadata: Option<JsonValue>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct CreateTagClaimPayload {
    pub collection_id: Uuid,
    pub slug: String,
    pub min_voter_reputation: Option<i32>,
    pub requires_approval: Option<bool>,
    pub metadata: Option<JsonValue>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct AddCollectionMembershipPayload {
    pub collection_id: Uuid,
    pub entity_pk_namespace: String,
    pub entity_pk: String,
    pub justification: Option<String>,
    pub confidence_score: Option<f64>,
    pub metadata: Option<JsonValue>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct CreateTagCollectionVotePayload {
    pub slug: String,
    pub left_collection_id: Uuid,
    pub right_collection_id: Uuid,
    pub magnitude: i32,
    pub attribute_id: i32,
    pub reason: Option<String>,
    pub metadata: Option<JsonValue>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct TagQueryParams {
    pub at_time: Option<NaiveDateTime>,
    pub include_metadata: Option<bool>,
    pub include_disputed: Option<bool>,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct CollectionQueryParams {
    pub include_memberships: Option<bool>,
    pub include_claims: Option<bool>,
    pub include_votes: Option<bool>,
}

// ============================================================================
// COMPOSITE RESPONSE TYPES
// ============================================================================

#[derive(Serialize, JsonSchema)]
pub struct TagCollectionWithDetails {
    pub collection: TagCollection,
    pub claims: Option<Vec<TagClaim>>,
    pub memberships: Option<Vec<CollectionMembership>>,
    pub recent_votes: Option<Vec<TagCollectionVote>>,
    pub reputation: Option<UserFolksonomyReputation>,
}

#[derive(Serialize, JsonSchema)]
pub struct SlugResolutionWithHistory {
    pub current: SlugResolution,
    pub historical: Vec<HistoricalResolution>,
    pub competing_collections: Vec<TagCollection>,
}

#[derive(Serialize, Debug, JsonSchema)]
pub struct HistoricalResolution {
    pub collection_id: Uuid,
    pub collection_name: String,
    pub vote_score: f64,
    pub valid_from: NaiveDateTime,
    pub valid_to: Option<NaiveDateTime>,
}

#[derive(Serialize, JsonSchema)]
pub struct FolksonomyStats {
    pub total_collections: i64,
    pub total_claims: i64,
    pub total_votes: i64,
    pub active_disputes: i64,
    pub top_collections: Vec<TagCollection>,
    pub recent_activity: Vec<RecentActivity>,
}

#[derive(Serialize, Debug, JsonSchema)]
pub struct RecentActivity {
    pub activity_type: String,
    pub slug: Option<String>,
    pub collection_id: Option<Uuid>,
    pub user_id: Uuid,
    pub timestamp: NaiveDateTime,
    pub description: String,
}

// ============================================================================
// PATH PARAMETERS
// ============================================================================

#[derive(Deserialize, JsonSchema)]
pub struct SlugPath {
    slug: String,
}

#[derive(Deserialize, JsonSchema)]
pub struct CollectionPath {
    collection_id: Uuid,
}

// ============================================================================
// CORE BUSINESS LOGIC FUNCTIONS
// ============================================================================

/// Create a new tag collection
pub async fn create_tag_collection<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: &CreateTagCollectionPayload,
    creator_user_id: Uuid,
) -> Result<TagCollection, Error> {
    let collection = query_as!(
        TagCollection,
        r#"
        INSERT INTO tag_collections (name, description, creator_user_id, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, description, creator_user_id, 
                  valid_from, valid_to, transaction_time, metadata, 
                  created_at, updated_at
        "#,
        payload.name,
        payload.description,
        creator_user_id,
        payload.metadata
    )
    .fetch_one(executor)
    .await
    .map_error("tag collection")?;

    Ok(collection)
}

/// Create a new tag claim for a collection
pub async fn create_tag_claim<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: &CreateTagClaimPayload,
    user_id: Uuid,
) -> Result<TagClaim, Error> {
    let claim = query_as!(
        TagClaim,
        r#"
        INSERT INTO tag_claims (collection_id, slug, min_voter_reputation, requires_approval, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, collection_id, slug, valid_from, valid_to, transaction_time,
                  vote_count, vote_score, last_vote_at, min_voter_reputation, 
                  requires_approval, status, metadata, created_at, updated_at
        "#,
        payload.collection_id,
        payload.slug,
        payload.min_voter_reputation.unwrap_or(0),
        payload.requires_approval.unwrap_or(false),
        payload.metadata
    )
    .fetch_one(executor)
    .await
    .map_error("tag claim")?;

    Ok(claim)
}

/// Add an entity to a collection
pub async fn add_collection_membership<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: &AddCollectionMembershipPayload,
    user_id: Uuid,
) -> Result<CollectionMembership, Error> {
    let membership = query_as!(
        CollectionMembership,
        r#"
        INSERT INTO collection_memberships 
        (collection_id, entity_pk_namespace, entity_pk, justification, confidence_score, added_by_user_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, collection_id, entity_pk_namespace, entity_pk, valid_from, valid_to, 
                  transaction_time, vote_count, vote_score, last_vote_at, justification, 
                  confidence_score, added_by_user_id, metadata, created_at, updated_at
        "#,
        payload.collection_id,
        payload.entity_pk_namespace,
        payload.entity_pk,
        payload.justification,
        payload.confidence_score,
        user_id,
        payload.metadata
    )
    .fetch_one(executor)
    .await
    .map_error("collection membership")?;

    Ok(membership)
}

/// Vote between two collections for a slug
pub async fn create_tag_collection_vote<'e, E: PgExecutor<'e>>(
    executor: E,
    payload: &CreateTagCollectionVotePayload,
    user_id: Uuid,
) -> Result<TagCollectionVote, Error> {
    let vote = query_as!(
        TagCollectionVote,
        r#"
        INSERT INTO tag_collection_votes 
        (slug, left_collection_id, right_collection_id, user_id, magnitude, attribute_id, reason, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, slug, left_collection_id, right_collection_id, user_id, magnitude, 
                  attribute_id, valid_from, valid_to, transaction_time, reason, metadata, created_at
        "#,
        payload.slug,
        payload.left_collection_id,
        payload.right_collection_id,
        user_id,
        payload.magnitude,
        payload.attribute_id,
        payload.reason,
        payload.metadata
    )
    .fetch_one(executor)
    .await
    .map_error("tag collection vote")?;

    Ok(vote)
}

/// Get current resolution for a slug
pub async fn get_slug_resolution<'e, E: PgExecutor<'e>>(
    executor: E,
    slug: &str,
) -> Result<Option<SlugResolution>, Error> {
    let resolution = query_as!(
        SlugResolution,
        r#"
        SELECT slug, winning_collection_id, total_votes, winning_score, runner_up_collection_id,
               runner_up_score, margin_of_victory, resolved_at, last_challenge_at, next_review_at,
               is_disputed, dispute_threshold_met, metadata, updated_at
        FROM slug_resolutions 
        WHERE slug = $1
        "#,
        slug
    )
    .fetch_optional(executor)
    .await
    .map_error("slug resolution")?;

    Ok(resolution)
}

/// Get historical resolutions for a slug at a specific time
pub async fn get_historical_resolutions<'e, E: PgExecutor<'e>>(
    executor: E,
    slug: &str,
    at_time: Option<NaiveDateTime>,
) -> Result<Vec<HistoricalResolution>, Error> {
    let time_point = at_time.unwrap_or_else(|| chrono::Utc::now().naive_utc());
    
    let historical = query_as!(
        HistoricalResolution,
        r#"
        SELECT tc.id as collection_id, tc.name as collection_name, 
               tcl.vote_score, tcl.valid_from, tcl.valid_to
        FROM tag_claims tcl
        JOIN tag_collections tc ON tc.id = tcl.collection_id
        WHERE tcl.slug = $1
          AND tcl.valid_from <= $2
          AND (tcl.valid_to IS NULL OR tcl.valid_to > $2)
          AND tc.valid_from <= $2
          AND (tc.valid_to IS NULL OR tc.valid_to > $2)
        ORDER BY tcl.vote_score DESC
        "#,
        slug,
        time_point
    )
    .fetch_all(executor)
    .await
    .map_error("historical resolutions")?;

    Ok(historical)
}

/// Get a tag collection with optional related data
pub async fn get_tag_collection_with_details<'a, A: PgAcquire<'a>>(
    acquire: A,
    collection_id: Uuid,
    query_params: &CollectionQueryParams,
) -> Result<TagCollectionWithDetails, Error> {
    let mut conn = acquire.acquire().await.map_error("database")?;

    // Get the main collection
    let collection = query_as!(
        TagCollection,
        r#"
        SELECT id, name, description, creator_user_id, valid_from, valid_to, 
               transaction_time, metadata, created_at, updated_at
        FROM tag_collections 
        WHERE id = $1 AND (valid_to IS NULL OR valid_to = 'infinity'::timestamp)
        "#,
        collection_id
    )
    .fetch_optional(&mut *conn)
    .await
    .map_error("tag collection")?
    .catch_not_found("tag collection")?;

    // Optionally get claims
    let claims = if query_params.include_claims.unwrap_or(false) {
        Some(
            query_as!(
                TagClaim,
                r#"
                SELECT id, collection_id, slug, valid_from, valid_to, transaction_time,
                       vote_count, vote_score, last_vote_at, min_voter_reputation,
                       requires_approval, status, metadata, created_at, updated_at
                FROM tag_claims 
                WHERE collection_id = $1 AND (valid_to IS NULL OR valid_to = 'infinity'::timestamp)
                ORDER BY vote_score DESC
                "#,
                collection_id
            )
            .fetch_all(&mut *conn)
            .await
            .map_error("tag claims")?,
        )
    } else {
        None
    };

    // Optionally get memberships
    let memberships = if query_params.include_memberships.unwrap_or(false) {
        Some(
            query_as!(
                CollectionMembership,
                r#"
                SELECT id, collection_id, entity_pk_namespace, entity_pk, valid_from, valid_to,
                       transaction_time, vote_count, vote_score, last_vote_at, justification,
                       confidence_score, added_by_user_id, metadata, created_at, updated_at
                FROM collection_memberships 
                WHERE collection_id = $1 AND (valid_to IS NULL OR valid_to = 'infinity'::timestamp)
                ORDER BY vote_score DESC
                "#,
                collection_id
            )
            .fetch_all(&mut *conn)
            .await
            .map_error("collection memberships")?,
        )
    } else {
        None
    };

    // Optionally get recent votes
    let recent_votes = if query_params.include_votes.unwrap_or(false) {
        Some(
            query_as!(
                TagCollectionVote,
                r#"
                SELECT id, slug, left_collection_id, right_collection_id, user_id, magnitude,
                       attribute_id, valid_from, valid_to, transaction_time, reason, metadata, created_at
                FROM tag_collection_votes 
                WHERE (left_collection_id = $1 OR right_collection_id = $1)
                  AND (valid_to IS NULL OR valid_to = 'infinity'::timestamp)
                ORDER BY created_at DESC
                LIMIT 50
                "#,
                collection_id
            )
            .fetch_all(&mut *conn)
            .await
            .map_error("tag collection votes")?,
        )
    } else {
        None
    };

    // Get reputation info
    let reputation = query_as!(
        UserFolksonomyReputation,
        r#"
        SELECT user_id, tag_creation_reputation, voting_reputation, curation_reputation,
               total_reputation, collections_created, votes_cast, successful_challenges,
               failed_challenges, valid_from, valid_to, transaction_time, metadata,
               created_at, updated_at
        FROM user_folksonomy_reputation 
        WHERE user_id = $1 AND (valid_to IS NULL OR valid_to = 'infinity'::timestamp)
        "#,
        collection.creator_user_id
    )
    .fetch_optional(&mut *conn)
    .await
    .map_error("user reputation")?;

    Ok(TagCollectionWithDetails {
        collection,
        claims,
        memberships,
        recent_votes,
        reputation,
    })
}

// ============================================================================
// ROUTING
// ============================================================================

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route(
            "/collections",
            post_with(create_collection_route, |op| {
                op.description("Create a new tag collection.")
                    .response::<201, Json<TagCollection>>()
            }),
        )
        .api_route(
            "/collections/:collection_id",
            get_with(get_collection_route, |op| {
                op.description("Get a tag collection with optional details.")
                    .response::<200, Json<TagCollectionWithDetails>>()
            }),
        )
        .api_route(
            "/claims",
            post_with(create_claim_route, |op| {
                op.description("Create a new tag claim for a collection.")
                    .response::<201, Json<TagClaim>>()
            }),
        )
        .api_route(
            "/memberships",
            post_with(add_membership_route, |op| {
                op.description("Add an entity to a collection.")
                    .response::<201, Json<CollectionMembership>>()
            }),
        )
        .api_route(
            "/votes",
            post_with(create_vote_route, |op| {
                op.description("Vote between two collections for a slug.")
                    .response::<201, Json<TagCollectionVote>>()
            }),
        )
        .api_route(
            "/slugs/:slug",
            get_with(get_slug_route, |op| {
                op.description("Get current and historical resolutions for a slug.")
                    .response::<200, Json<SlugResolutionWithHistory>>()
            }),
        )
        .api_route(
            "/stats",
            get_with(get_stats_route, |op| {
                op.description("Get folksonomy system statistics.")
                    .response::<200, Json<FolksonomyStats>>()
            }),
        )
}

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

async fn create_collection_route(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<CreateTagCollectionPayload>,
) -> Result<(StatusCode, Json<TagCollection>), Error> {
    let collection = create_tag_collection(&state.db, &payload, user.id).await?;
    Ok((StatusCode::CREATED, Json(collection)))
}

async fn get_collection_route(
    State(state): State<AppState>,
    Path(path): Path<CollectionPath>,
    Query(params): Query<CollectionQueryParams>,
) -> Result<Json<TagCollectionWithDetails>, Error> {
    let collection = get_tag_collection_with_details(&state.db, path.collection_id, &params).await?;
    Ok(Json(collection))
}

async fn create_claim_route(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<CreateTagClaimPayload>,
) -> Result<(StatusCode, Json<TagClaim>), Error> {
    let claim = create_tag_claim(&state.db, &payload, user.id).await?;
    Ok((StatusCode::CREATED, Json(claim)))
}

async fn add_membership_route(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<AddCollectionMembershipPayload>,
) -> Result<(StatusCode, Json<CollectionMembership>), Error> {
    let membership = add_collection_membership(&state.db, &payload, user.id).await?;
    Ok((StatusCode::CREATED, Json(membership)))
}

async fn create_vote_route(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<CreateTagCollectionVotePayload>,
) -> Result<(StatusCode, Json<TagCollectionVote>), Error> {
    let vote = create_tag_collection_vote(&state.db, &payload, user.id).await?;
    Ok((StatusCode::CREATED, Json(vote)))
}

async fn get_slug_route(
    State(state): State<AppState>,
    Path(path): Path<SlugPath>,
    Query(params): Query<TagQueryParams>,
) -> Result<Json<SlugResolutionWithHistory>, Error> {
    let mut conn = state.db.acquire().await.map_error("database")?;

    // Get current resolution
    let current = get_slug_resolution(&mut *conn, &path.slug)
        .await?
        .catch_not_found("slug resolution")?;

    // Get historical resolutions
    let historical = get_historical_resolutions(&mut *conn, &path.slug, params.at_time).await?;

    // Get competing collections
    let competing_collections = query_as!(
        TagCollection,
        r#"
        SELECT DISTINCT tc.id, tc.name, tc.description, tc.creator_user_id, tc.valid_from, 
               tc.valid_to, tc.transaction_time, tc.metadata, tc.created_at, tc.updated_at
        FROM tag_collections tc
        JOIN tag_claims tcl ON tc.id = tcl.collection_id
        WHERE tcl.slug = $1 
          AND tcl.status = 'active'
          AND (tcl.valid_to IS NULL OR tcl.valid_to = 'infinity'::timestamp)
          AND (tc.valid_to IS NULL OR tc.valid_to = 'infinity'::timestamp)
        ORDER BY tc.name
        "#,
        path.slug
    )
    .fetch_all(&mut *conn)
    .await
    .map_error("competing collections")?;

    Ok(Json(SlugResolutionWithHistory {
        current,
        historical,
        competing_collections,
    }))
}

async fn get_stats_route(State(state): State<AppState>) -> Result<Json<FolksonomyStats>, Error> {
    let mut conn = state.db.acquire().await.map_error("database")?;

    // Get basic counts
    let total_collections: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM tag_collections WHERE valid_to IS NULL OR valid_to = 'infinity'::timestamp"
    )
    .fetch_one(&mut *conn)
    .await
    .map_error("collection count")?
    .unwrap_or(0);

    let total_claims: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM tag_claims WHERE valid_to IS NULL OR valid_to = 'infinity'::timestamp"
    )
    .fetch_one(&mut *conn)
    .await
    .map_error("claim count")?
    .unwrap_or(0);

    let total_votes: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM tag_collection_votes WHERE valid_to IS NULL OR valid_to = 'infinity'::timestamp"
    )
    .fetch_one(&mut *conn)
    .await
    .map_error("vote count")?
    .unwrap_or(0);

    let active_disputes: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM slug_resolutions WHERE is_disputed = true"
    )
    .fetch_one(&mut *conn)
    .await
    .map_error("dispute count")?
    .unwrap_or(0);

    // Get top collections by activity
    let top_collections = query_as!(
        TagCollection,
        r#"
        SELECT tc.id, tc.name, tc.description, tc.creator_user_id, tc.valid_from, 
               tc.valid_to, tc.transaction_time, tc.metadata, tc.created_at, tc.updated_at
        FROM tag_collections tc
        LEFT JOIN tag_claims tcl ON tc.id = tcl.collection_id
        WHERE (tc.valid_to IS NULL OR tc.valid_to = 'infinity'::timestamp)
        GROUP BY tc.id, tc.name, tc.description, tc.creator_user_id, tc.valid_from, 
                 tc.valid_to, tc.transaction_time, tc.metadata, tc.created_at, tc.updated_at
        ORDER BY COALESCE(SUM(tcl.vote_count), 0) DESC
        LIMIT 10
        "#
    )
    .fetch_all(&mut *conn)
    .await
    .map_error("top collections")?;

    // Get recent activity (simplified)
    let recent_activity = query_as!(
        RecentActivity,
        r#"
        SELECT 'vote' as activity_type, slug, left_collection_id as collection_id, 
               user_id, created_at as timestamp, 
               'Voted on slug: ' || slug as description
        FROM tag_collection_votes 
        WHERE valid_to IS NULL OR valid_to = 'infinity'::timestamp
        ORDER BY created_at DESC
        LIMIT 20
        "#
    )
    .fetch_all(&mut *conn)
    .await
    .map_error("recent activity")?;

    Ok(Json(FolksonomyStats {
        total_collections,
        total_claims,
        total_votes,
        active_disputes,
        top_collections,
        recent_activity,
    }))
}