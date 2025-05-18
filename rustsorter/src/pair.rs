use std::collections::HashSet;

use axum::{extract::{Query, State}, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use rand::seq::{IteratorRandom, SliceRandom};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{app_state::AppState};

#[derive(Debug, Clone)]
struct Item {
    _id: i32,
    _title: String,
    _body: Option<String>,
    _url: Option<String>,
    _slug: String,
}

#[derive(Debug, Clone)]
struct SortedItem {
    id: i32,
    title: String,
    slug: String,
    _elo: f32,
}

impl From<SortedItem> for Item {
    fn from(val: SortedItem) -> Self {
        Item {
            _id: val.id,
            _title: val.title,
            _body: None,
            _url: None,
            _slug: val.slug,
        }
    }
}

#[derive(Debug, Clone)]
struct _Skip {
    item_id: i32,
}

#[derive(Debug, Clone)]
struct _Vote {
    left_item_id: i32,
    right_item_id: i32,
    _magnitude: i32,
}

// --- New Structures for API ---

#[derive(Deserialize, Debug)]
pub struct PairQueryParams {
    // for when you have a specific pair in mind
    left_ns: Option<String>, 
    left_pk: Option<String>,
    right_ns: Option<String>,
    right_pk: Option<String>,

    // for when you want _children_ of this pair
    pk_namespace: Option<String>,
    pk: Option<String>,
}

// Placeholder response structure - adjust according to your actual Entity model
#[derive(Serialize, Debug)]
pub struct PairResponse {
    left_entity: crate::entity::Entity, // Use your actual Entity model
    right_entity: crate::entity::Entity, // Use your actual Entity model
}

async fn get_entity(state: &AppState, ns: String, pk: String) -> Result<crate::entity::Entity, sqlx::Error> {
    let entity = sqlx::query_as!(
        crate::entity::Entity,
        "SELECT * FROM entities WHERE pk_namespace = $1 AND pk = $2",
        ns,
        pk
    )
    .fetch_one(&state.db)
    .await?;

    Ok(entity)
}

async fn get_children_entities(
    state: &AppState,
    parent_ns: String,
    parent_pk: String,
) -> Result<Vec<crate::entity::Entity>, sqlx::Error> {
    let children = sqlx::query_as!(
        crate::entity::Entity,
        r#"
        SELECT e.* 
        FROM entities e
        JOIN entity_relationships er ON e.pk_namespace = er.child_pk_namespace AND e.pk = er.child_pk
        WHERE er.parent_pk_namespace = $1 AND er.parent_pk = $2
        "#,
        parent_ns,
        parent_pk
    )
    .fetch_all(&state.db)
    .await?;

    Ok(children)
}

// --- Handler Function ---

async fn get_pair_handler(
    State(state): State<AppState>,
    Query(params): Query<PairQueryParams>,
) -> Result<impl IntoResponse, impl IntoResponse> {
    match (params.left_ns, params.left_pk, params.right_ns, params.right_pk, params.pk_namespace, params.pk) {
        (Some(left_ns), Some(left_pk), Some(right_ns), Some(right_pk), None, None) => {
            let left_entity = get_entity(&state, left_ns, left_pk).await?;
            let right_entity = get_entity(&state, right_ns, right_pk).await?;
            let response: Result<Json<PairResponse>, crate::models::ErrorResponse> = Ok(Json(PairResponse { 
                left_entity: left_entity, right_entity: right_entity 
            }));
            response
        }
        (None, None, None, None, Some(pk_namespace), Some(pk)) => {

            // get the children entities
            let children_entities = get_children_entities(&state, pk_namespace, pk).await?;

            // TODO more advanced pair choosing logic
            let left_entity = children_entities.choose(&mut rand::thread_rng()).unwrap();
            let mut right_entity = children_entities.choose(&mut rand::thread_rng()).unwrap();
            while left_entity.pk == right_entity.pk {
                right_entity = children_entities.choose(&mut rand::thread_rng()).unwrap();
            }

            // return the parent and children entities  
            let response: Result<Json<PairResponse>, crate::models::ErrorResponse> = Ok(Json(PairResponse { 
                left_entity: left_entity.clone(), right_entity: right_entity.clone()
            }));
            response
        }

        _ => {
            return Err(crate::models::ErrorResponse::new(StatusCode::BAD_REQUEST, "Invalid query parameters".to_string()));
        }
    }
}


// --- Router Function ---
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(get_pair_handler))
}