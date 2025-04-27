use std::collections::HashSet;

use axum::{extract::{Query, State}, http::StatusCode, response::IntoResponse, routing::get, Json, Router};
use rand::seq::{IteratorRandom, SliceRandom};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::{app_state::AppState, models::{Entity, self}}; // Assuming models::Entity exists

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
    left_ns: Option<String>,
    left_pk: Option<String>,
    right_ns: Option<String>,
    right_pk: Option<String>,
}

// Placeholder response structure - adjust according to your actual Entity model
#[derive(Serialize, Debug)]
pub struct PairResponse {
    #[serde(rename = "leftEntity")]
    left_entity: models::Entity, // Use your actual Entity model
    #[serde(rename = "rightEntity")]
    right_entity: models::Entity, // Use your actual Entity model
    // Add other fields if needed
}


// --- Handler Function ---

async fn get_pair_handler(
    State(state): State<AppState>,
    Query(params): Query<PairQueryParams>,
    // maybe_user: MaybeUser // Add if you need user authentication later
) -> Result<impl IntoResponse, impl IntoResponse> {
    log::info!("Received request for pair with params: {:?}", params);

    // --- Dummy Data Implementation ---
    // TODO: Replace with actual logic to fetch/select a pair based on params and user votes

    // Example: If specific pair is requested, log it. Otherwise, generate dummy pair.
    if params.left_ns.is_some() && params.left_pk.is_some() && params.right_ns.is_some() && params.right_pk.is_some() {
        log::info!("Specific pair requested: Left({}/{}), Right({}/{})",
            params.left_ns.as_deref().unwrap_or("?"),
            params.left_pk.as_deref().unwrap_or("?"),
            params.right_ns.as_deref().unwrap_or("?"),
            params.right_pk.as_deref().unwrap_or("?")
        );
        // In a real implementation, you'd fetch these specific entities here.
    } else {
        log::info!("No specific pair requested, generating dummy pair.");
        // In a real implementation, you'd select a pair based on voting algorithm/availability.
    }

    // Create dummy entities (replace with actual fetched/selected entities)
    let dummy_left = crate::entity::Entity {
        id: 1, // Replace with actual ID generation or fetching
        pk_namespace: params.left_ns.unwrap_or_else(|| "dummy.item".to_string()),
        pk: params.left_pk.unwrap_or_else(|| "left123".to_string()),
        title: "Dummy Left Item".to_string(),
        entity_type: "item".to_string(),
        metadata: Some(json!({"description": "This is the left dummy item."})),
        profile_picture_url: Some("https://via.placeholder.com/150/0000FF/808080?text=Left".to_string()),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    let dummy_right = models::Entity {
        id: 2, // Replace with actual ID generation or fetching
        pk_namespace: params.right_ns.unwrap_or_else(|| "dummy.item".to_string()),
        pk: params.right_pk.unwrap_or_else(|| "right456".to_string()),
        title: "Dummy Right Item".to_string(),
        entity_type: "item".to_string(),
        metadata: Some(json!({"description": "This is the right dummy item."})),
        profile_picture_url: Some("https://via.placeholder.com/150/FF0000/FFFFFF?text=Right".to_string()),
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };


    let response = PairResponse {
        left_entity: dummy_left,
        right_entity: dummy_right,
    };

    let response: Result<Json<PairResponse>, crate::models::ErrorResponse> = Ok(Json(response));

    response

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

