use aide::axum::{ApiRouter, routing::get};
use axum::extract::{Query, State};
use rand::seq::SliceRandom;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::types::Uuid;
use ts_rs::TS;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    list_actions,
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

#[derive(Deserialize, Debug, JsonSchema, TS)]
#[ts(export)]
pub struct PairQueryParams {
    ns: String,
    pk: String,
    left_pin_ns: Option<String>,
    left_pin_pk: Option<String>,
    right_pin_ns: Option<String>,
    right_pin_pk: Option<String>,
}

#[derive(Serialize, Debug, JsonSchema, TS)]
#[ts(export)]
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
    a.ns == b.ns && a.pk == b.pk
}

/// Convert Entity to EntityIdentifier for ranking
fn entity_to_identifier(entity: &crate::entity::Entity) -> crate::pagerank::EntityIdentifier {
    crate::pagerank::EntityIdentifier {
        ns: entity.ns.clone(),
        pk: entity.pk.clone(),
    }
}

/// Check if an entity matches an EntityIdentifier
fn entity_matches_identifier(
    entity: &crate::entity::Entity,
    identifier: &crate::pagerank::EntityIdentifier,
) -> bool {
    entity.ns == identifier.ns && entity.pk == identifier.pk
}

/// Check if a pair of entities has already been voted on
fn pair_already_voted(
    entity1: &crate::entity::Entity,
    entity2: &crate::entity::Entity,
    existing_votes: &[crate::pagerank::RelevantVote],
) -> bool {
    existing_votes.iter().any(|vote| {
        (vote.left_entity_ns == entity1.ns
            && vote.left_entity_pk == entity1.pk
            && vote.right_entity_ns == entity2.ns
            && vote.right_entity_pk == entity2.pk)
            || (vote.left_entity_ns == entity2.ns
                && vote.left_entity_pk == entity2.pk
                && vote.right_entity_ns == entity1.ns
                && vote.right_entity_pk == entity1.pk)
    })
}

/// Select a pair using ranking-based algorithm
fn select_ranked_entity_pair(
    left_entities: &[crate::entity::Entity],
    right_entities: &[crate::entity::Entity],
    unsorted: &[crate::pagerank::EntityIdentifier],
    sorted: &[crate::pagerank::RankedEntity],
    existing_votes: &[crate::pagerank::RelevantVote],
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
                        let left_entity = (*left_unsorted.choose(&mut rng).unwrap()).clone();
                        let mut right_pool = right_unsorted.clone();
                        right_pool.retain(|e| !entities_are_same(e, &left_entity));

                        if right_pool.is_empty() {
                            return Err(PairSelectionError::InsufficientEntities);
                        }

                        let right_entity = (*right_pool.choose(&mut rng).unwrap()).clone();
                        return Ok((left_entity, right_entity));
                    }

                    (right_unsorted, left_sorted, false)
                } else {
                    // Only left has unsorted, must pick from left
                    let left_entity = (*left_unsorted.choose(&mut rng).unwrap()).clone();
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
                let right_entity = (*right_unsorted.choose(&mut rng).unwrap()).clone();
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
        // Strategy 2: All entities are sorted, find adjacent pairs in ranking order
        // that haven't been voted on yet (1st vs 2nd, then 2nd vs 3rd, etc.)

        // Create entity lookup maps for both pools
        let mut left_entity_map = std::collections::HashMap::new();
        for entity in left_entities {
            left_entity_map.insert(
                (entity.ns.clone(), entity.pk.clone()),
                entity,
            );
        }

        let mut right_entity_map = std::collections::HashMap::new();
        for entity in right_entities {
            right_entity_map.insert(
                (entity.ns.clone(), entity.pk.clone()),
                entity,
            );
        }

        // Try adjacent pairs in ranking order
        for i in 0..sorted.len().saturating_sub(1) {
            let first_ranked = &sorted[i];
            let second_ranked = &sorted[i + 1];

            let first_key = (
                first_ranked.identifier.ns.clone(),
                first_ranked.identifier.pk.clone(),
            );
            let second_key = (
                second_ranked.identifier.ns.clone(),
                second_ranked.identifier.pk.clone(),
            );

            // Check if we can form a pair with these adjacent entities
            if let (Some(&first_entity), Some(&second_entity)) = (
                left_entity_map.get(&first_key).or_else(|| right_entity_map.get(&first_key)),
                left_entity_map.get(&second_key).or_else(|| right_entity_map.get(&second_key)),
            ) {
                // Check if both entities are in different pools (or same pool if no restrictions)
                let first_in_left = left_entity_map.contains_key(&first_key);
                let second_in_left = left_entity_map.contains_key(&second_key);
                let first_in_right = right_entity_map.contains_key(&first_key);
                let second_in_right = right_entity_map.contains_key(&second_key);

                // Must have one entity available in each pool
                let can_pair = (first_in_left && second_in_right) || (first_in_right && second_in_left);

                if can_pair && !pair_already_voted(first_entity, second_entity, existing_votes) {
                    // Return the pair with the left pool entity first if possible
                    if first_in_left {
                        return Ok((first_entity.clone(), second_entity.clone()));
                    } else {
                        return Ok((second_entity.clone(), first_entity.clone()));
                    }
                }
            }
        }

        // If no adjacent pairs are available, fall back to any valid unvoted pair
        for left_entity in left_entities {
            for right_entity in right_entities {
                if !entities_are_same(left_entity, right_entity)
                    && !pair_already_voted(left_entity, right_entity, existing_votes)
                {
                    return Ok((left_entity.clone(), right_entity.clone()));
                }
            }
        }

        Err(PairSelectionError::InsufficientEntities)
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
    user_id: Uuid,
    parent_ns: &str,
    parent_pk: &str,
    pin_ns: Option<&str>,
    pin_pk: Option<&str>,
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

    let (_, membership) =
        list_actions::resolve_children_membership(state, user_id, parent_ns, parent_pk, children)
            .await?;

    Ok(membership
        .into_iter()
        .filter_map(|(entity, is_in)| if is_in { Some(entity) } else { None })
        .collect())
}

async fn get_pair_handler(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Query(params): Query<PairQueryParams>,
) -> Result<Json<PairResponse>, Error> {
    // Get left pool
    let left_entities = get_filtered_children(
        &state,
        user.id,
        &params.ns,
        &params.pk,
        params.left_pin_ns.as_deref(),
        params.left_pin_pk.as_deref(),
    )
    .await?;

    // Get right pool
    let right_entities = get_filtered_children(
        &state,
        user.id,
        &params.ns,
        &params.pk,
        params.right_pin_ns.as_deref(),
        params.right_pin_pk.as_deref(),
    )
    .await?;


    let all_children =
        get_filtered_children(&state, user.id, &params.ns, &params.pk, None, None).await?;


    // Convert to identifiers for ranking
    let entity_identifiers: Vec<crate::pagerank::EntityIdentifier> =
        all_children.iter().map(entity_to_identifier).collect();

    // Prepare entity keys for vote query
    let entity_keys: Vec<String> = entity_identifiers
        .iter()
        .map(|e| format!("{}:{}", e.ns, e.pk))
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
        select_ranked_entity_pair(&left_entities, &right_entities, &unsorted, &sorted, &votes)
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
            ns: ns.to_string(),
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
            assert!(!(left.ns == right.ns && left.pk == right.pk));
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
        assert_eq!(left.ns, "ns1");
        assert!(!(left.ns == right.ns && left.pk == right.pk));
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
        assert!(!(left.ns == right.ns && left.pk == right.pk));
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
        assert_eq!(left.ns, "ns1");
        assert_eq!(left.pk, "pk1");
        assert!(!(left.ns == right.ns && left.pk == right.pk));
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
        assert_eq!(right.ns, "ns1");
        assert!(!(left.ns == right.ns && left.pk == right.pk));
    }

    #[test]
    fn test_both_pins_different_entities() {
        let result = select_entity_pair(
            &vec![create_test_entity("ns1", "pk1")],
            &vec![create_test_entity("ns2", "pk2")],
        );
        assert!(result.is_ok());

        let (left, right) = result.unwrap();
        assert_eq!(left.ns, "ns1");
        assert_eq!(left.pk, "pk1");
        assert_eq!(right.ns, "ns2");
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
                || left.ns != first_pair.0.ns
                || right.pk != first_pair.1.pk
                || right.ns != first_pair.1.ns
        });

        // This test might occasionally fail due to randomness, but it's very unlikely
        // with 10 iterations
        assert!(
            has_variety || entities.len() == 2,
            "Expected some variety in random selection"
        );
    }
}
