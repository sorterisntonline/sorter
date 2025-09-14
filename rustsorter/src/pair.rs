use aide::axum::{ApiRouter, routing::get};
use axum::extract::{Query, State};
use rand::seq::SliceRandom;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    app_state::AppState,
    models::{Error, Json, MapErrorSqlx},
    pagerank::RankingResponse,
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
    ranking: crate::pagerank::RankingResponse,
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
fn entity_matches_identifier(entity: &crate::entity::Entity, identifier: &crate::pagerank::EntityIdentifier) -> bool {
    entity.pk_namespace == identifier.pk_namespace && entity.pk == identifier.pk
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

/// Select a pair when all entities are sorted (no unsorted entities exist)
fn select_ranked_entity_pair(
   left_entities: &[crate::entity::Entity],
   right_entities: &[crate::entity::Entity],
   sorted: &[crate::pagerank::RankedEntity],
) -> Result<(crate::entity::Entity, crate::entity::Entity), PairSelectionError> {
   if left_entities.is_empty() || right_entities.is_empty() {
       return Err(PairSelectionError::PinNotFound);
   }

   // Create position map for sorted entities
   let mut position_map = std::collections::HashMap::new();
   for (pos, ranked_entity) in sorted.iter().enumerate() {
       position_map.insert(
           (ranked_entity.identifier.pk_namespace.clone(), ranked_entity.identifier.pk.clone()),
           pos + 1  // 1-indexed positions
       );
   }

   // Find best pair (lowest combined rank)
   let mut best_pair: Option<(crate::entity::Entity, crate::entity::Entity, usize)> = None;

   for left_entity in left_entities {
       let left_key = (left_entity.pk_namespace.clone(), left_entity.pk.clone());
       let Some(&left_pos) = position_map.get(&left_key) else {
           continue;
       };

       for right_entity in right_entities {
           if entities_are_same(left_entity, right_entity) {
               continue;
           }

           let right_key = (right_entity.pk_namespace.clone(), right_entity.pk.clone());
           let Some(&right_pos) = position_map.get(&right_key) else {
               continue;
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

/// Select a pair when there are unsorted entities present
pub fn select_entity_pair(
   left_entities: &[crate::entity::Entity],
   right_entities: &[crate::entity::Entity],
   unsorted: &[crate::pagerank::EntityIdentifier],
   sorted: &[crate::pagerank::RankedEntity],
) -> Result<(crate::entity::Entity, crate::entity::Entity), PairSelectionError> {
   let mut rng = rand::thread_rng();

   // Find unsorted entities in each pool
   let left_unsorted: Vec<&crate::entity::Entity> = left_entities
       .iter()
       .filter(|e| unsorted.iter().any(|u| entity_matches_identifier(e, u)))
       .collect();

   let right_unsorted: Vec<&crate::entity::Entity> = right_entities
       .iter()
       .filter(|e| unsorted.iter().any(|u| entity_matches_identifier(e, u)))
       .collect();

   // Find sorted entities in each pool
   let left_sorted: Vec<&crate::entity::Entity> = left_entities
       .iter()
       .filter(|e| sorted.iter().any(|s| entity_matches_identifier(e, &s.identifier)))
       .collect();

   let right_sorted: Vec<&crate::entity::Entity> = right_entities
       .iter()
       .filter(|e| sorted.iter().any(|s| entity_matches_identifier(e, &s.identifier)))
       .collect();

   // Case 1: Neither pool has sorted items - return random from each pool
   if left_sorted.is_empty() && right_sorted.is_empty() {
       let left_entity = left_entities.choose(&mut rng).unwrap().clone();
       
       let right_pool: Vec<&crate::entity::Entity> = right_entities
           .iter()
           .filter(|e| !entities_are_same(e, &left_entity))
           .collect();
           
       let right_entity = (*right_pool.choose(&mut rng).unwrap()).clone();
       return Ok((left_entity, right_entity));
   }

   // Case 2: Unsorted entities exist but not in either pool - use ranking strategy
   if left_unsorted.is_empty() && right_unsorted.is_empty() {
       return select_ranked_entity_pair(left_entities, right_entities, sorted);
   }

   // Case 3: Only one pool has unsorted - pair unsorted with sorted from other pool
   if !left_unsorted.is_empty() && right_unsorted.is_empty() {
       let left_entity = (*left_unsorted.choose(&mut rng).unwrap()).clone();
       let right_entity = (*right_sorted.choose(&mut rng).unwrap()).clone();
       return Ok((left_entity, right_entity));
   }

   if left_unsorted.is_empty() && !right_unsorted.is_empty() {
       let left_entity = (*left_sorted.choose(&mut rng).unwrap()).clone();
       let right_entity = (*right_unsorted.choose(&mut rng).unwrap()).clone();
       return Ok((left_entity, right_entity));
   }

   // Case 4: Both pools have unsorted and sorted entities - choose complementary pairs
   let left_entity = left_entities.choose(&mut rng).unwrap().clone();
   
   // Choose complementary from right: if left is unsorted, prefer sorted; if left is sorted, prefer unsorted
   let is_left_unsorted = unsorted.iter().any(|u| entity_matches_identifier(&left_entity, u));
   
   let preferred_right = if is_left_unsorted { &right_sorted } else { &right_unsorted };
   
   let right_entity = (*preferred_right.choose(&mut rng).unwrap()).clone();
   Ok((left_entity, right_entity))
}

async fn get_pair_handler(
    State(state): State<AppState>,
    Query(params): Query<PairQueryParams>,
) -> Result<Json<PairResponse>, Error> {
    // Check if parent entity exists
    let parent_exists = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM entities WHERE pk_namespace = $1 AND pk = $2)",
        params.pk_namespace,
        params.pk
    )
    .fetch_one(&state.db)
    .await
    .map_error("entity")?
    .unwrap_or(false);
    
    if !parent_exists {
        return Err(Error::NotFound {
            object: "Parent Entity".into()
        });
    }

    // Get all children first to check minimum count
    let all_children = get_filtered_children(
        &state,
        params.pk_namespace.clone(),
        params.pk.clone(),
        None,
        None
    ).await?;

    // Check if we have at least 2 children
    if all_children.len() < 2 {
        return Err(Error::BadRequest {
            message: "Parent must have at least 2 children".into()
        });
    }

    // Get left pool
    let left_entities = get_filtered_children(
        &state, 
        params.pk_namespace.clone(), 
        params.pk.clone(), 
        params.left_pin_ns.clone(), 
        params.left_pin_pk.clone()
    ).await?;
    
    // Get right pool
    let right_entities = get_filtered_children(
        &state, 
        params.pk_namespace.clone(), 
        params.pk.clone(), 
        params.right_pin_ns.clone(), 
        params.right_pin_pk.clone()
    ).await?;
    
    // Check if either pool is empty
    if left_entities.is_empty() {
        return Err(Error::BadRequest {
            message: "Left pin filter resulted in empty set".into()
        });
    }
    
    if right_entities.is_empty() {
        return Err(Error::BadRequest {
            message: "Right pin filter resulted in empty set".into()
        });
    }
    
    // Check if both pins give the same singleton
    if left_entities.len() == 1 && right_entities.len() == 1 {
        if entities_are_same(&left_entities[0], &right_entities[0]) {
            return Err(Error::BadRequest {
                message: "Both pins point to the same single entity".into()
            });
        }
    }

    // Convert to identifiers for ranking
    let entity_identifiers: Vec<crate::pagerank::EntityIdentifier> = all_children
        .iter()
        .map(entity_to_identifier)
        .collect();

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

    // Select pair based on whether we have unsorted entities
    let (left_entity, right_entity) = if unsorted.is_empty() {
        // All entities have been voted on - use ranking strategy
        select_ranked_entity_pair(&left_entities, &right_entities, &sorted)
    } else {
        // There are unvoted entities - prioritize getting them voted on
        select_entity_pair(&left_entities, &right_entities, &unsorted, &sorted)
    }
    .map_err(|e| Error::Internal(anyhow::anyhow!("Pair selection failed despite validation checks: {:?}", e)))?;

    let ranking = RankingResponse {
            sorted,
            unsorted,
        };
    Ok(Json(PairResponse {
        left_entity,
        right_entity,
        ranking
    }))
}

pub fn routes() -> ApiRouter<AppState> {
   ApiRouter::new().api_route("/", get(get_pair_handler))
}

// TODO: add new arguments to select_entity_pair
#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

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

        let left_entities = vec![
            create_test_entity("ns1", "pk1")
        ];
        
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
            left.pk != first_pair.0.pk || 
            left.pk_namespace != first_pair.0.pk_namespace ||
            right.pk != first_pair.1.pk || 
            right.pk_namespace != first_pair.1.pk_namespace
        });
        
        // This test might occasionally fail due to randomness, but it's very unlikely with 10 iterations
        assert!(has_variety || entities.len() == 2, "Expected some variety in random selection");
    }
}