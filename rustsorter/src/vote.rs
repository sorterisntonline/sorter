use aide::axum::{
    ApiRouter,
    routing::{get_with, post_with},
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
};
use chrono::NaiveDateTime;
use log::warn;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, IntoNotFound, Json, MapErrorSqlx},
    pagerank::{RelevantVote, EntityIdentifier},
};

#[derive(Serialize, Debug, sqlx::FromRow, JsonSchema)]
pub struct Vote {
    pub left_entity_pk_namespace: String,
    pub left_entity_pk: String,
    pub right_entity_pk_namespace: String,
    pub right_entity_pk: String,
    pub user_id: Uuid,
    pub magnitude: i32,
    pub rationale: Option<String>,
    pub attribute_id: i32,
    pub created_at: NaiveDateTime,
    pub deleted_at: Option<NaiveDateTime>,
}

#[derive(Deserialize, JsonSchema)]
pub struct VotePath {
    left_ns: String,
    left_pk: String,
    right_ns: String,
    right_pk: String,
    user_id: Uuid,
    attr_id: i32,
}

#[derive(Deserialize, Debug, JsonSchema)]
pub struct VotePayload {
    left_entity_pk_namespace: String,
    left_entity_pk: String,
    right_entity_pk_namespace: String,
    right_entity_pk: String,
    magnitude: i32,
    rationale: Option<String>,
    attribute_id: i32,
}

async fn create_vote(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<VotePayload>,
) -> Result<(StatusCode, Json<Vote>), Error> {
    let (left_ns, left_pk, right_ns, right_pk, magnitude) = if (
        payload.left_entity_pk_namespace.clone(),
        payload.left_entity_pk.clone(),
    ) < (
        payload.right_entity_pk_namespace.clone(),
        payload.right_entity_pk.clone(),
    ) {
        (
            payload.left_entity_pk_namespace,
            payload.left_entity_pk,
            payload.right_entity_pk_namespace,
            payload.right_entity_pk,
            payload.magnitude,
        )
    } else {
        (
            payload.right_entity_pk_namespace,
            payload.right_entity_pk,
            payload.left_entity_pk_namespace,
            payload.left_entity_pk,
            -payload.magnitude,
        )
    };

    let vote = sqlx::query_file_as!(
        Vote,
        "../database/sql/vote/insert.sql",
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        magnitude,
        payload.rationale,
        payload.attribute_id,
        user.id,
    )
    .fetch_one(&state.db)
    .await
    .map_error("entity pair")?;

    Ok((StatusCode::CREATED, Json(vote)))
}

async fn get_vote(
    State(state): State<AppState>,
    Path(path): Path<VotePath>,
) -> Result<(StatusCode, Json<Vote>), Error> {
    let (query_left_ns, query_left_pk, query_right_ns, query_right_pk) = if (
        path.left_ns.clone(),
        path.left_pk.clone(),
    ) < (
        path.right_ns.clone(),
        path.right_pk.clone(),
    ) {
        (path.left_ns, path.left_pk, path.right_ns, path.right_pk)
    } else {
        warn!(left_ns = path.left_ns, left_pk = path.left_pk, right_ns = path.right_ns, right_pk = path.right_pk; "request path for get_vote received non-canonical order for pair");
        (path.left_ns, path.left_pk, path.right_ns, path.right_pk)
    };

    let vote = sqlx::query_file_as!(
        Vote,
        "../database/sql/vote/select.sql",
        query_left_ns,
        query_left_pk,
        query_right_ns,
        query_right_pk,
        path.user_id,
        path.attr_id
    )
    .fetch_optional(&state.db)
    .await
    .map_error("vote")?
    .catch_not_found("vote")?;

    Ok((StatusCode::OK, Json(vote)))
}

#[derive(Deserialize, Debug)]
struct VoteFilterParams {
    _user_id: Option<Uuid>,
    _attribute_id: Option<i32>,
    _parent_entity_ns: Option<String>,
    _parent_entity_pk: Option<String>,
}

#[derive(Deserialize, Debug, JsonSchema)]
struct VotesQueryParams {
    // Arrays of ns and pk with equal length (1-2)
    ns: Vec<String>,
    pk: Vec<String>,
}

#[derive(Deserialize, Debug, JsonSchema)]
struct EntityIdentifierPayload {
    pk_namespace: String,
    pk: String,
}

#[derive(Deserialize, Debug, JsonSchema)]
#[serde(tag = "kind")]
enum VotesFilterPayload {
    Single { entity: EntityIdentifierPayload },
    Pair { entities: [EntityIdentifierPayload; 2] },
}

async fn list_votes(State(state): State<AppState>) -> Result<(StatusCode, Json<Vec<Vote>>), Error> {
    let votes = sqlx::query_file_as!(Vote, "../database/sql/vote/list.sql",)
        .fetch_all(&state.db)
        .await
        .map_error("votes")?;

    Ok((StatusCode::OK, Json(votes)))
}

async fn get_votes_filtered_get(
    State(state): State<AppState>,
    Query(params): Query<VotesQueryParams>,
) -> Result<(StatusCode, Json<Vec<Vote>>), Error> {
    // Required: ns/pk arrays only
    if params.ns.len() != params.pk.len() || params.ns.is_empty() || params.ns.len() > 2 {
        return Err(Error::BadRequest { message: "ns and pk must be equal length, 1 or 2".into() });
    }

    let parsed_entities: Vec<(String, String)> = params
        .ns
        .into_iter()
        .zip(params.pk.into_iter())
        .map(|(n, p)| (n, p))
        .collect();

    // Reuse common logic below
    fetch_votes_by_entities(state, parsed_entities).await
}

async fn get_votes_filtered_post(
    State(state): State<AppState>,
    Json(payload): Json<VotesFilterPayload>,
) -> Result<(StatusCode, Json<Vec<Vote>>), Error> {
    let parsed_entities: Vec<(String, String)> = match payload {
        VotesFilterPayload::Single { entity } => vec![(entity.pk_namespace, entity.pk)],
        VotesFilterPayload::Pair { entities } => entities
            .into_iter()
            .map(|e| (e.pk_namespace, e.pk))
            .collect(),
    };

    fetch_votes_by_entities(state, parsed_entities).await
}

async fn fetch_votes_by_entities(
    state: AppState,
    parsed_entities: Vec<(String, String)>,
) -> Result<(StatusCode, Json<Vec<Vote>>), Error> {

    let votes = if parsed_entities.len() == 1 {
        // Single entity: find all votes involving this entity
        let (ns, pk) = &parsed_entities[0];
        sqlx::query_file_as!(
            Vote,
            "../database/sql/vote/list_for_entity.sql",
            ns,
            pk
        )
        .fetch_all(&state.db)
        .await
        .map_error("votes for entity")?
    } else {
        // Two entities: find votes between this specific pair
        let (left_ns, left_pk) = &parsed_entities[0];
        let (right_ns, right_pk) = &parsed_entities[1];

        // Ensure canonical ordering
        let (query_left_ns, query_left_pk, query_right_ns, query_right_pk) = if (
            left_ns.clone(),
            left_pk.clone(),
        ) < (
            right_ns.clone(),
            right_pk.clone(),
        ) {
            (left_ns.clone(), left_pk.clone(), right_ns.clone(), right_pk.clone())
        } else {
            (right_ns.clone(), right_pk.clone(), left_ns.clone(), left_pk.clone())
        };

        sqlx::query_file_as!(
            Vote,
            "../database/sql/vote/list_for_pair.sql",
            query_left_ns,
            query_left_pk,
            query_right_ns,
            query_right_pk
        )
        .fetch_all(&state.db)
        .await
        .map_error("votes for pair")?
    };

    Ok((StatusCode::OK, Json(votes)))
}

async fn get_votes_for_itemset(
    State(state): State<AppState>,
    Json(payload): Json<Vec<EntityIdentifier>>,
) -> Result<(StatusCode, Json<Vec<RelevantVote>>), Error> {
    if payload.is_empty() {
        return Ok((StatusCode::OK, Json(vec![])));
    }

    let entity_keys: Vec<String> = payload
        .iter()
        .map(|e| format!("{}:{}", e.pk_namespace, e.pk))
        .collect();

    // This reuses the powerful query from pagerank.rs!
    let votes = sqlx::query_file_as!(
        RelevantVote,
        "../database/sql/vote/select_partial.sql",
        &entity_keys
    )
    .fetch_all(&state.db)
    .await
    .map_error("votes for itemset")?;

    Ok((StatusCode::OK, Json(votes)))
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route(
            "/",
            post_with(create_vote, |op| {
                op.description("Create a new vote.")
                    .response::<201, Json<Vote>>()
            })
            .get_with(list_votes, |op| {
                op.description("List all votes.")
                    .response::<200, Json<Vec<Vote>>>()
            }),
        )
        .api_route(
            "/filtered",
            get_with(get_votes_filtered_get, |op| {
                op.description("Get votes filtered by involved entities (GET ns/pk arrays).")
                    .response::<200, Json<Vec<Vote>>>()
            })
            .post_with(get_votes_filtered_post, |op| {
                op.description("Get votes filtered by involved entities (POST tagged union).")
                    .response::<200, Json<Vec<Vote>>>()
            }),
        )
        .api_route(
            "/bulk-query",
            post_with(get_votes_for_itemset, |op| {
                op.description("Get all votes between a specific set of entities.")
                    .response::<200, Json<Vec<RelevantVote>>>()
            }),
        )
        .api_route(
            "/{left_ns}/{left_pk}/{right_ns}/{right_pk}/{attr_id}",
            get_with(get_vote, |op| {
                op.description("Get a vote.").response::<200, Json<Vote>>()
            }),
        )
}
