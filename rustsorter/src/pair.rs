use axum::{
    Json,
    Router,
    extract::{Query, State},
    response::IntoResponse,
    routing::get,
};
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};

use crate::{
    app_state::AppState,
    models::{Error, MapErrorSqlx},
};

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

#[derive(Deserialize, Debug)]
pub struct PairQueryParams {
    left_ns: Option<String>,
    left_pk: Option<String>,
    right_ns: Option<String>,
    right_pk: Option<String>,
    pk_namespace: Option<String>,
    pk: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct PairResponse {
    left_entity: crate::entity::Entity,
    right_entity: crate::entity::Entity,
}

async fn get_entity(
    state: &AppState,
    ns: String,
    pk: String,
) -> Result<crate::entity::Entity, Error> {
    let entity = sqlx::query_file_as!(
        crate::entity::Entity,
        "../database/sql/entity/select.sql",
        ns,
        pk
    )
    .fetch_one(&state.db)
    .await
    .map_error("entity")?;

    Ok(entity)
}

async fn get_children_entities(
    state: &AppState,
    parent_ns: String,
    parent_pk: String,
) -> Result<Vec<crate::entity::Entity>, Error> {
    let children = sqlx::query_file_as!(
        crate::entity::Entity,
        "../database/sql/entity/select_children.sql",
        parent_ns,
        parent_pk
    )
    .fetch_all(&state.db)
    .await
    .map_error("entity")?;

    Ok(children)
}

async fn get_pair_handler(
    State(state): State<AppState>,
    Query(params): Query<PairQueryParams>,
) -> Result<impl IntoResponse, Error> {
    match (
        params.left_ns,
        params.left_pk,
        params.right_ns,
        params.right_pk,
        params.pk_namespace,
        params.pk,
    ) {
        (Some(left_ns), Some(left_pk), Some(right_ns), Some(right_pk), None, None) => {
            let left_entity = get_entity(&state, left_ns, left_pk).await?;
            let right_entity = get_entity(&state, right_ns, right_pk).await?;

            Ok(Json(PairResponse {
                left_entity,
                right_entity,
            }))
        }
        (None, None, None, None, Some(pk_namespace), Some(pk)) => {
            let children_entities = get_children_entities(&state, pk_namespace, pk).await?;

            // TODO more advanced pair choosing logic
            let left_entity = children_entities.choose(&mut rand::thread_rng()).unwrap();
            let mut right_entity = children_entities.choose(&mut rand::thread_rng()).unwrap();
            while left_entity.pk == right_entity.pk {
                right_entity = children_entities.choose(&mut rand::thread_rng()).unwrap();
            }

            Ok(Json(PairResponse {
                left_entity: left_entity.clone(),
                right_entity: right_entity.clone(),
            }))
        }
        _ => Err(Error::BadRequest {
            message: "invalid query parameters".into(),
        }),
    }
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/", get(get_pair_handler))
}
