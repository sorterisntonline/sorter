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


fn _pair<'a>(
    sorted: &'a [SortedItem],
    unsorted: &'a [Item],
    skips: &'a [_Skip],
    votes: &'a [_Vote],
    pinned_left: Option<i32>,
    pinned_right: Option<i32>,
) -> Vec<Item> {
    let mut sorted = sorted.to_owned();
    let mut unsorted = unsorted.to_owned();

    let skipped_items = skips.iter().map(|x| x.item_id).collect::<HashSet<i32>>();

    sorted.retain(|x| !skipped_items.contains(&x.id));
    unsorted.retain(|x| !skipped_items.contains(&x._id));

    if sorted.is_empty() {
        if unsorted.len() < 2 {
            vec![]
        } else {
            match (pinned_left, pinned_right) {
                (Some(pinned_left), Some(pinned_right)) => {
                    let pinned_left_item = unsorted
                        .iter()
                        .find(|x| x._id == pinned_left)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| (x._id != pinned_left) && (x._id != pinned_right))
                        .choose_multiple(&mut rand::thread_rng(), 1);

                    vec![pinned_left_item.clone(), sample[0].clone()]
                }
                (None, Some(pinned_right)) => {
                    let pinned_right_item = unsorted
                        .iter()
                        .find(|x| x._id == pinned_right)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| x._id != pinned_right)
                        .choose_multiple(&mut rand::thread_rng(), 1);

                    vec![pinned_right_item.clone(), sample[0].clone()]
                }
                (Some(pinned_left), None) => {
                    let pinned_left_item = unsorted
                        .iter()
                        .find(|x| x._id == pinned_left)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| x._id != pinned_left)
                        .choose_multiple(&mut rand::thread_rng(), 1);
                    vec![pinned_left_item.clone(), sample[0].clone()]
                }
                (None, None) => {
                    let sample = unsorted.iter().choose_multiple(&mut rand::thread_rng(), 2);
                    sample.into_iter().cloned().collect()
                }
            }
        }
    } else if !sorted.is_empty() {
        match (pinned_left, pinned_right) {
            (Some(pinned_left), Some(pinned_right)) => {
                let pinned_left_item = unsorted.iter().find(|x| x._id == pinned_left);
                let pinned_right_item = unsorted.iter().find(|x| x._id == pinned_right);

                match (pinned_left_item, pinned_right_item) {
                    (Some(pinned_left_item), Some(pinned_right_item)) => {
                        return vec![pinned_left_item.clone(), pinned_right_item.clone()];
                    }
                    (Some(_), None) => {
                        let left = pinned_left_item.unwrap();
                        let right = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![left.clone(), right.clone().into()];
                    }
                    (None, Some(_)) => {
                        let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                        let right = pinned_right_item.unwrap();
                        return vec![left.clone().into(), right.clone()];
                    }
                    (None, None) => {
                        let left = sorted.iter().find(|x| x.id == pinned_left);
                        let right = sorted.iter().find(|x| x.id == pinned_right);

                        match (left, right) {
                            (Some(left), Some(right)) => {
                                return vec![left.clone().into(), right.clone().into()];
                            }
                            _ => {
                                panic!("pinned item not found 7");
                            }
                        }
                    }
                }
            }
            (Some(pinned_left), None) => {
                let sorted_pinned = sorted.iter().find(|x| x.id == pinned_left);

                match sorted_pinned {
                    Some(pinned) => {
                        let left = pinned;
                        let mut sorted = sorted.clone();
                        sorted.sort_by(|a, b| {
                            let a = f32::abs(a._elo - left._elo);
                            let b = f32::abs(b._elo - left._elo);
                            a.partial_cmp(&b).unwrap()
                        });

                        if !unsorted.is_empty() {
                            let right = unsorted.choose(&mut rand::thread_rng()).unwrap();
                            return vec![left.clone().into(), right.clone()];
                        }
                        let right = sorted
                            .iter()
                            .take(10)
                            .filter(|x| x.id != left.id)
                            .choose(&mut rand::thread_rng())
                            .unwrap();
                        return vec![left.clone().into(), right.clone().into()];
                    }
                    None => {
                        let pinned = unsorted
                            .iter()
                            .find(|x| x._id == pinned_left)
                            .expect("pinned item not found 3");

                        let right = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![pinned.clone(), right.clone().into()];
                    }
                }
            }
            (None, Some(pinned_right)) => {
                let sorted_pinned = sorted.iter().find(|x| x.id == pinned_right);

                match sorted_pinned {
                    Some(pinned) => {
                        let left = pinned;
                        let mut sorted = sorted.clone();
                        sorted.sort_by(|a, b| {
                            let a = f32::abs(a._elo - left._elo);
                            let b = f32::abs(b._elo - left._elo);
                            a.partial_cmp(&b).unwrap()
                        });

                        if !unsorted.is_empty() {
                            let left = unsorted.choose(&mut rand::thread_rng()).unwrap();
                            return vec![left.clone(), pinned.clone().into()];
                        }
                        let left = sorted
                            .iter()
                            .take(10)
                            .filter(|x| x.id != pinned.id)
                            .choose(&mut rand::thread_rng())
                            .unwrap();
                        return vec![left.clone().into(), pinned.clone().into()];
                    }
                    None => {
                        let pinned = unsorted
                            .iter()
                            .find(|x| x._id == pinned_right)
                            .expect("pinned item not found 4");

                        let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![left.clone().into(), pinned.clone()];
                    }
                }
            }
            (None, None) => {
                if !unsorted.is_empty() {
                    let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                    let mut sorted = sorted.clone();
                    sorted.sort_by(|a, b| {
                        let a = f32::abs(a._elo - left._elo);
                        let b = f32::abs(b._elo - left._elo);
                        a.partial_cmp(&b).unwrap()
                    });

                    let right = unsorted.choose(&mut rand::thread_rng()).unwrap();
                    return vec![left.clone().into(), right.clone()];
                } else {
                    let mut voted_pairs = HashSet::new();
                    for vote in votes {
                        voted_pairs.insert((vote.left_item_id, vote.right_item_id));
                    }

                    let pairs = sorted.windows(2).collect::<Vec<_>>();

                    for pair in pairs {
                        if !voted_pairs.contains(&(pair[0].id, pair[1].id))
                            && !voted_pairs.contains(&(pair[1].id, pair[0].id))
                        {
                            return vec![pair[0].clone().into(), pair[1].clone().into()];
                        }
                    }

                    let pair = sorted.choose(&mut rand::thread_rng()).unwrap();
                    let mut sorted = sorted.clone();
                    sorted.sort_by(|a, b| {
                        let a = f32::abs(a._elo - pair._elo);
                        let b = f32::abs(b._elo - pair._elo);
                        a.partial_cmp(&b).unwrap()
                    });

                    let right = sorted
                        .iter()
                        .take(10)
                        .filter(|x| x.id != pair.id)
                        .choose(&mut rand::thread_rng())
                        .unwrap();
                    return vec![pair.clone().into(), right.clone().into()];
                }
            }
        };
    } else {
        panic!("should not be able to reach here");
    }
}

