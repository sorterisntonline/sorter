use aide::axum::{ApiRouter, routing::get};
use axum::extract::{Query, State};
use rand::seq::SliceRandom;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    app_state::AppState,
    models::{Error, Json, MapErrorSqlx},
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

#[derive(Deserialize, Debug, JsonSchema)]
pub struct PairQueryParams {
    pk_namespace: String,
    pk: String,
    left_pin_ns: Option<String>,
    left_pin_pk: Option<String>,
    right_pin_ns: Option<String>,
    right_pin_pk: Option<String>,
}

#[derive(Serialize, Debug, JsonSchema)]
pub struct PairResponse {
    left_entity: crate::entity::Entity,
    right_entity: crate::entity::Entity,
}

#[derive(Debug, PartialEq)]
pub enum PairSelectionError {
    InsufficientEntities,
    PinNotFound,
}

fn entities_are_same(a: &crate::entity::Entity, b: &crate::entity::Entity) -> bool {
    a.pk_namespace == b.pk_namespace && a.pk == b.pk
}

/// Convert Entity to EntityIdentifier for ranking
fn entity_to_identifier(entity: &crate::entity::Entity) -> crate::pagerank::EntityIdentifier {
    crate::pagerank::EntityIdentifier {
        pk_namespace: entity.pk_namespace.clone(),
        pk: entity.pk.clone(),
    }
}

/// Check if an entity matches an EntityIdentifier
fn entity_matches_identifier(
    entity: &crate::entity::Entity,
    identifier: &crate::pagerank::EntityIdentifier,
) -> bool {
    entity.pk_namespace == identifier.pk_namespace && entity.pk == identifier.pk
}

/// Select a pair using ranking-based algorithm
fn select_ranked_entity_pair(
    left_entities: &[crate::entity::Entity],
    right_entities: &[crate::entity::Entity],
    unsorted: &[crate::pagerank::EntityIdentifier],
    sorted: &[crate::pagerank::RankedEntity],
) -> Result<(crate::entity::Entity, crate::entity::Entity), PairSelectionError> {
    // Check if we have entities in both pools
    if left_entities.is_empty() || right_entities.is_empty() {
        return Err(PairSelectionError::PinNotFound);
    }

    let mut rng = rand::thread_rng();

    // Build sets of unsorted entities in each pool
    let left_unsorted: Vec<&crate::entity::Entity> = left_entities
        .iter()
        .filter(|e| unsorted.iter().any(|u| entity_matches_identifier(e, u)))
        .collect();

    let right_unsorted: Vec<&crate::entity::Entity> = right_entities
        .iter()
        .filter(|e| unsorted.iter().any(|u| entity_matches_identifier(e, u)))
        .collect();

    // Strategy 1: If there are unsorted entities, pair one with a sorted entity
    if !left_unsorted.is_empty() || !right_unsorted.is_empty() {
        // Prefer to have unsorted on the left
        let (unsorted_pool, sorted_pool, prefer_left) = if !left_unsorted.is_empty() {
            // Find sorted entities in right pool
            let right_sorted: Vec<&crate::entity::Entity> = right_entities
                .iter()
                .filter(|e| {
                    sorted
                        .iter()
                        .any(|s| entity_matches_identifier(e, &s.identifier))
                })
                .collect();

            if right_sorted.is_empty() {
                // No sorted in right pool, try opposite configuration
                if !right_unsorted.is_empty() {
                    let left_sorted: Vec<&crate::entity::Entity> = left_entities
                        .iter()
                        .filter(|e| {
                            sorted
                                .iter()
                                .any(|s| entity_matches_identifier(e, &s.identifier))
                        })
                        .collect();

                    if left_sorted.is_empty() {
                        // Both pools only have unsorted, pick randomly from each
                        let left_entity = left_unsorted.choose(&mut rng).unwrap().clone().clone();
                        let mut right_pool = right_unsorted.clone();
                        right_pool.retain(|e| !entities_are_same(e, &left_entity));

                        if right_pool.is_empty() {
                            return Err(PairSelectionError::InsufficientEntities);
                        }

                        let right_entity = right_pool.choose(&mut rng).unwrap().clone().clone();
                        return Ok((left_entity, right_entity));
                    }

                    (right_unsorted, left_sorted, false)
                } else {
                    // Only left has unsorted, must pick from left
                    let left_entity = left_unsorted.choose(&mut rng).unwrap().clone().clone();
                    let mut right_pool = right_entities.to_vec();
                    right_pool.retain(|e| !entities_are_same(e, &left_entity));

                    if right_pool.is_empty() {
                        return Err(PairSelectionError::InsufficientEntities);
                    }

                    let right_entity = right_pool.choose(&mut rng).unwrap().clone();
                    return Ok((left_entity, right_entity));
                }
            } else {
                (left_unsorted, right_sorted, true)
            }
        } else {
            // Only right has unsorted
            let left_sorted: Vec<&crate::entity::Entity> = left_entities
                .iter()
                .filter(|e| {
                    sorted
                        .iter()
                        .any(|s| entity_matches_identifier(e, &s.identifier))
                })
                .collect();

            if left_sorted.is_empty() {
                // No sorted entities available, pick two unsorted
                let right_entity = right_unsorted.choose(&mut rng).unwrap().clone().clone();
                let mut left_pool = left_entities.to_vec();
                left_pool.retain(|e| !entities_are_same(e, &right_entity));

                if left_pool.is_empty() {
                    return Err(PairSelectionError::InsufficientEntities);
                }

                let left_entity = left_pool.choose(&mut rng).unwrap().clone();
                return Ok((left_entity, right_entity));
            }

            (right_unsorted, left_sorted, false)
        };

        // Pick random unsorted and random sorted
        let unsorted_entity = (*unsorted_pool.choose(&mut rng).unwrap()).clone();
        let mut sorted_pool_filtered: Vec<crate::entity::Entity> =
            sorted_pool.into_iter().cloned().collect();
        use log::info;
        info!("picking unsorted entity");
        sorted_pool_filtered.retain(|e| !entities_are_same(e, &unsorted_entity));

        if sorted_pool_filtered.is_empty() {
            return Err(PairSelectionError::InsufficientEntities);
        }

        let sorted_entity = sorted_pool_filtered.choose(&mut rng).unwrap().clone();

        if prefer_left {
            Ok((unsorted_entity, sorted_entity))
        } else {
            Ok((sorted_entity, unsorted_entity))
        }
    } else {
        // Strategy 2: All entities are sorted, find the best matchup

        // Create position map for sorted entities
        let mut position_map = std::collections::HashMap::new();
        for (pos, ranked_entity) in sorted.iter().enumerate() {
            position_map.insert(
                (
                    ranked_entity.identifier.pk_namespace.clone(),
                    ranked_entity.identifier.pk.clone(),
                ),
                pos + 1, // 1-indexed positions
            );
        }

        // Find best pair (lowest combined rank)
        let mut best_pair: Option<(crate::entity::Entity, crate::entity::Entity, usize)> = None;

        for left_entity in left_entities {
            let left_key = (left_entity.pk_namespace.clone(), left_entity.pk.clone());
            let Some(&left_pos) = position_map.get(&left_key) else {
                continue; // Skip if not in sorted list
            };

            for right_entity in right_entities {
                // Skip if same entity
                if entities_are_same(left_entity, right_entity) {
                    continue;
                }

                let right_key = (right_entity.pk_namespace.clone(), right_entity.pk.clone());
                let Some(&right_pos) = position_map.get(&right_key) else {
                    continue; // Skip if not in sorted list
                };

                let combined_rank = left_pos + right_pos;

                if best_pair.is_none() || combined_rank < best_pair.as_ref().unwrap().2 {
                    best_pair = Some((left_entity.clone(), right_entity.clone(), combined_rank));
                }
            }
        }

        best_pair
            .map(|(left, right, _)| (left, right))
            .ok_or(PairSelectionError::InsufficientEntities)
    }
}

/// Pure function to select a pair of entities from a list of child entities
pub fn select_entity_pair(
    left_entities: &[crate::entity::Entity],
    right_entities: &[crate::entity::Entity],
) -> Result<(crate::entity::Entity, crate::entity::Entity), PairSelectionError> {
    // For backwards compatibility, when no ranking info is available, use random
    // selection

    // Check if we have entities in both pools
    if left_entities.is_empty() || right_entities.is_empty() {
        return Err(PairSelectionError::PinNotFound);
    }

    let mut left_pool = left_entities.to_vec();
    let mut right_pool = right_entities.to_vec();

    // If right_pool is a singleton, remove it from left_pool to avoid accidental
    // selection
    if right_pool.len() == 1 {
        left_pool.retain(|e| !entities_are_same(e, &right_pool[0]));
        // If this leaves left_pool empty, we can't form a pair
        if left_pool.is_empty() {
            return Err(PairSelectionError::InsufficientEntities);
        }
    }

    let mut rng = rand::thread_rng();

    // Choose left entity
    let left_entity = left_pool.choose(&mut rng).unwrap().clone();

    // Remove the chosen left entity from right pool to ensure distinct selection
    right_pool.retain(|e| !entities_are_same(e, &left_entity));

    if right_pool.is_empty() {
        return Err(PairSelectionError::InsufficientEntities);
    }

    let right_entity = right_pool.choose(&mut rng).unwrap().clone();

    Ok((left_entity, right_entity))
}

async fn get_filtered_children(
    state: &AppState,
    parent_ns: String,
    parent_pk: String,
    pin_ns: Option<String>,
    pin_pk: Option<String>,
) -> Result<Vec<crate::entity::Entity>, Error> {
    let children = sqlx::query_file_as!(
        crate::entity::Entity,
        "../database/sql/entity/select_children_filtered.sql",
        parent_ns,
        parent_pk,
        pin_ns,
        pin_pk
    )
    .fetch_all(&state.db)
    .await
    .map_error("entity")?;

    Ok(children)
}

async fn get_pair_handler(
    State(state): State<AppState>,
    Query(params): Query<PairQueryParams>,
) -> Result<Json<PairResponse>, Error> {
    // Get left pool
    let left_entities = get_filtered_children(
        &state,
        params.pk_namespace.clone(),
        params.pk.clone(),
        params.left_pin_ns.clone(),
        params.left_pin_pk.clone(),
    )
    .await?;

    // Get right pool
    let right_entities = get_filtered_children(
        &state,
        params.pk_namespace.clone(),
        params.pk.clone(),
        params.right_pin_ns.clone(),
        params.right_pin_pk.clone(),
    )
    .await?;

    // Get all children for ranking
    let all_children = get_filtered_children(
        &state,
        params.pk_namespace.clone(),
        params.pk.clone(),
        None,
        None,
    )
    .await?;

    // Convert to identifiers for ranking
    let entity_identifiers: Vec<crate::pagerank::EntityIdentifier> =
        all_children.iter().map(entity_to_identifier).collect();

    // Prepare entity keys for vote query
    let entity_keys: Vec<String> = entity_identifiers
        .iter()
        .map(|e| format!("{}:{}", e.pk_namespace, e.pk))
        .collect();

    // Fetch votes
    let votes = sqlx::query_file_as!(
        crate::pagerank::RelevantVote,
        "../database/sql/vote/select_partial.sql",
        &entity_keys
    )
    .fetch_all(&state.db)
    .await
    .map_error("votes")?;

    // Get ranking
    let (unsorted, sorted) = crate::pagerank::rank_entities(&entity_identifiers, &votes)?;

    // Select pair using ranking if available, otherwise fall back to random
    let (left_entity, right_entity) = if sorted.is_empty() && unsorted.is_empty() {
        // No ranking info available, use random selection
        select_entity_pair(&left_entities, &right_entities)
    } else {
        // Use ranking-based selection
        select_ranked_entity_pair(&left_entities, &right_entities, &unsorted, &sorted)
    }
    .map_err(|e| Error::BadRequest {
        message: format!("Unable to select valid entity pair: {:?}", e).into(),
    })?;

    Ok(Json(PairResponse {
        left_entity,
        right_entity,
    }))
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route("/", get(get_pair_handler))
}

#[cfg(test)]
mod tests {
    use uuid::Uuid;

    use super::*;

    // Helper function to create test entities
    fn create_test_entity(ns: &str, pk: &str) -> crate::entity::Entity {
        crate::entity::Entity {
            user_id: Uuid::new_v4(),
            pk_namespace: ns.to_string(),
            pk: pk.to_string(),
            title: Some(format!("Test Entity {}-{}", ns, pk)),
            profile_picture_url: None,
            metadata: None,
            created_at: None,
        }
    }

    #[test]
    fn test_select_pair_basic_functionality() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
        ];

        for _ in 0..100 {
            let result = select_entity_pair(&entities, &entities);
            assert!(result.is_ok());

            let (left, right) = result.unwrap();
            // Ensure entities are distinct
            assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
        }
    }

    #[test]
    fn test_select_pair_insufficient_entities() {
        let entities = vec![create_test_entity("ns1", "pk1")];

        let result = select_entity_pair(&entities, &entities);
        assert_eq!(result.err(), Some(PairSelectionError::InsufficientEntities));
    }

    #[test]
    fn test_select_pair_empty_entities() {
        let entities = vec![];

        let result = select_entity_pair(&entities, &entities);
        assert_eq!(result.err(), Some(PairSelectionError::PinNotFound));
    }

    #[test]
    fn test_select_pair_only_duplicate_entities() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk1"), // Same as first
        ];

        let result = select_entity_pair(&entities, &entities);
        assert_eq!(result.err(), Some(PairSelectionError::InsufficientEntities));
    }

    #[test]
    fn test_left_pin_ns_only() {
        let right_entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
        ];
        let left_entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
        ];

        let result = select_entity_pair(&left_entities, &right_entities);
        assert!(result.is_ok());

        let (left, right) = result.unwrap();
        assert_eq!(left.pk_namespace, "ns1");
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_left_pin_pk_only() {
        let right_entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns2", "pk1"),
            create_test_entity("ns1", "pk2"),
        ];

        let left_entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns2", "pk1"),
        ];

        let result = select_entity_pair(&left_entities, &right_entities);
        assert!(result.is_ok());

        let (left, right) = result.unwrap();
        assert_eq!(left.pk, "pk1");
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_left_pin_ns_and_pk() {
        let right_entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
        ];

        let left_entities = vec![create_test_entity("ns1", "pk1")];

        let result = select_entity_pair(&left_entities, &right_entities);
        assert!(result.is_ok());

        let (left, right) = result.unwrap();
        assert_eq!(left.pk_namespace, "ns1");
        assert_eq!(left.pk, "pk1");
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_right_pin_ns_only() {
        let left_entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
        ];
        let right_entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
        ];

        let result = select_entity_pair(&left_entities, &right_entities);

        let (left, right) = result.unwrap();
        assert_eq!(right.pk_namespace, "ns1");
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_both_pins_different_entities() {
        let result = select_entity_pair(
            &vec![create_test_entity("ns1", "pk1")],
            &vec![create_test_entity("ns2", "pk2")],
        );
        assert!(result.is_ok());

        let (left, right) = result.unwrap();
        assert_eq!(left.pk_namespace, "ns1");
        assert_eq!(left.pk, "pk1");
        assert_eq!(right.pk_namespace, "ns2");
        assert_eq!(right.pk, "pk2");
    }

    #[test]
    fn test_multiple_selections_produce_different_pairs() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
            create_test_entity("ns2", "pk2"),
        ];

        // Run multiple times to verify randomness
        let mut results = Vec::new();
        for _ in 0..10 {
            let result = select_entity_pair(&entities, &entities);
            assert!(result.is_ok());
            results.push(result.unwrap());
        }

        // Check that we get some variety (not all pairs are identical)
        let first_pair = &results[0];
        let has_variety = results.iter().any(|(left, right)| {
            left.pk != first_pair.0.pk
                || left.pk_namespace != first_pair.0.pk_namespace
                || right.pk != first_pair.1.pk
                || right.pk_namespace != first_pair.1.pk_namespace
        });

        // This test might occasionally fail due to randomness, but it's very unlikely
        // with 10 iterations
        assert!(
            has_variety || entities.len() == 2,
            "Expected some variety in random selection"
        );
    }
}
