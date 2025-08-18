use aide::axum::{ApiRouter, routing::get};
use axum::extract::{Query, State};
use rand::seq::SliceRandom;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

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

/// Pure function to select a pair of entities from a list of child entities
pub fn select_entity_pair(
    entities: &[crate::entity::Entity],
    left_pin_ns: Option<&str>,
    left_pin_pk: Option<&str>,
    right_pin_ns: Option<&str>,
    right_pin_pk: Option<&str>,
) -> Result<(crate::entity::Entity, crate::entity::Entity), PairSelectionError> {
        if entities.len() < 2 {
        return Err(PairSelectionError::InsufficientEntities);
    }

    // Check if we have at least 2 distinct entities
    let unique_entities: HashSet<_> = entities
        .iter()
        .map(|e| (&e.pk_namespace as &str, &e.pk as &str))
        .collect();
    
    if unique_entities.len() < 2 {
        return Err(PairSelectionError::InsufficientEntities);
    }

    // Find all matching entities for left and right
    let mut left_matches = find_all_matching(entities, left_pin_ns, left_pin_pk);
    let mut right_matches = find_all_matching(entities, right_pin_ns, right_pin_pk);

    // Check if pins found any matches
    if left_matches.is_empty() || right_matches.is_empty() {
        return Err(PairSelectionError::PinNotFound);
    }

    // If right_matches is a singleton, remove it from left_matches to avoid accidental selection
    if right_matches.len() == 1 {
        left_matches.retain(|e| !entities_are_same(e, &right_matches[0]));
        // If this leaves left_matches empty, we can't form a pair
        if left_matches.is_empty() {
            return Err(PairSelectionError::InsufficientEntities);
        }
    }

    let mut rng = rand::thread_rng();

    // Choose left entity
    let left_entity = left_matches.choose(&mut rng).unwrap().clone();

    right_matches.retain(|e| !entities_are_same(e, &left_entity));
    let right_entity = right_matches.choose(&mut rng).unwrap().clone();

    Ok((left_entity, right_entity))
}

fn find_all_matching(
    entities: &[crate::entity::Entity],
    pin_ns: Option<&str>,
    pin_pk: Option<&str>,
) -> Vec<crate::entity::Entity> {
    // Return all entities if no pin specified
    if pin_ns.is_none() && pin_pk.is_none() {
        return entities.to_vec();
    }
    
    entities
        .iter()
        .filter(|entity| {
            let ns_matches = pin_ns.map_or(true, |ns| entity.pk_namespace == ns);
            let pk_matches = pin_pk.map_or(true, |pk| entity.pk == pk);
            ns_matches && pk_matches
        })
        .cloned()
        .collect()
}

fn entities_are_same(a: &crate::entity::Entity, b: &crate::entity::Entity) -> bool {
    a.pk_namespace == b.pk_namespace && a.pk == b.pk
}

async fn _get_entity(
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
) -> Result<Json<PairResponse>, Error> {
    let children_entities = get_children_entities(&state, params.pk_namespace, params.pk).await?;

    let (left_entity, right_entity) = select_entity_pair(
        &children_entities,
        params.left_pin_ns.as_deref(),
        params.left_pin_pk.as_deref(),
        params.right_pin_ns.as_deref(),
        params.right_pin_pk.as_deref(),
    ).map_err(|e| Error::BadRequest { 
        message: format!("Unable to select valid entity pair: {:?}", e).into()
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
    use super::*;
    use uuid::Uuid;
    // Add this import if you're using chrono for NaiveDateTime
    // use chrono::NaiveDateTime;

    // Helper function to create test entities
    fn create_test_entity(ns: &str, pk: &str) -> crate::entity::Entity {
        crate::entity::Entity {
            user_id: Uuid::new_v4(), // Generate a random UUID
            pk_namespace: ns.to_string(),
            pk: pk.to_string(),
            title: Some(format!("Test Entity {}-{}", ns, pk)), // Wrap in Some()
            profile_picture_url: None,
            metadata: None,
            created_at: None, // Or use Some(NaiveDateTime::from_timestamp(0, 0).unwrap()) if you need a specific datetime
        }
    }

    #[test]
    fn test_select_pair_basic_functionality() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
        ];

        let result = select_entity_pair(&entities, None, None, None, None);
        assert!(result.is_ok());
        
        let (left, right) = result.unwrap();
        // Ensure entities are distinct
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_select_pair_insufficient_entities() {
        let entities = vec![create_test_entity("ns1", "pk1")];
        
        let result = select_entity_pair(&entities, None, None, None, None);
        assert_eq!(result.err(), Some(PairSelectionError::InsufficientEntities));
    }

    #[test]
    fn test_select_pair_empty_entities() {
        let entities = vec![];
        
        let result = select_entity_pair(&entities, None, None, None, None);
        assert_eq!(result.err(), Some(PairSelectionError::InsufficientEntities));
    }

    #[test]
    fn test_select_pair_only_duplicate_entities() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk1"), // Same as first
        ];

        let result = select_entity_pair(&entities, None, None, None, None);
        assert_eq!(result.err(), Some(PairSelectionError::InsufficientEntities));
    }

    #[test]
    fn test_left_pin_ns_only() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
        ];

        let result = select_entity_pair(&entities, Some("ns1"), None, None, None);
        assert!(result.is_ok());
        
        let (left, right) = result.unwrap();
        assert_eq!(left.pk_namespace, "ns1");
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_left_pin_pk_only() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns2", "pk1"),
            create_test_entity("ns1", "pk2"),
        ];

        let result = select_entity_pair(&entities, None, Some("pk1"), None, None);
        assert!(result.is_ok());
        
        let (left, right) = result.unwrap();
        assert_eq!(left.pk, "pk1");
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_left_pin_ns_and_pk() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
        ];

        let result = select_entity_pair(&entities, Some("ns1"), Some("pk2"), None, None);
        assert!(result.is_ok());
        
        let (left, right) = result.unwrap();
        assert_eq!(left.pk_namespace, "ns1");
        assert_eq!(left.pk, "pk2");
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_right_pin_ns_only() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns2", "pk1"),
            create_test_entity("ns2", "pk2"),
        ];

        let result = select_entity_pair(&entities, None, None, Some("ns2"), None);
        assert!(result.is_ok());
        
        let (left, right) = result.unwrap();
        assert_eq!(right.pk_namespace, "ns2");
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
    }

    #[test]
    fn test_both_pins_different_entities() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
            create_test_entity("ns2", "pk1"),
        ];

        let result = select_entity_pair(&entities, Some("ns1"), Some("pk1"), Some("ns1"), Some("pk2"));
        assert!(result.is_ok());
        
        let (left, right) = result.unwrap();
        assert_eq!(left.pk_namespace, "ns1");
        assert_eq!(left.pk, "pk1");
        assert_eq!(right.pk_namespace, "ns1");
        assert_eq!(right.pk, "pk2");
    }

    #[test]
    fn test_left_pin_not_found() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
        ];

        let result = select_entity_pair(&entities, Some("ns_nonexistent"), Some("pk1"), None, None);
        assert_eq!(result.err(), Some(PairSelectionError::PinNotFound));
    }

    #[test]
    fn test_right_pin_not_found() {
        let entities = vec![
            create_test_entity("ns1", "pk1"),
            create_test_entity("ns1", "pk2"),
        ];

        let result = select_entity_pair(&entities, None, None, Some("ns1"), Some("pk_nonexistent"));
        assert_eq!(result.err(), Some(PairSelectionError::PinNotFound));
    }

    #[test]
    fn test_entities_are_properly_formatted() {
        let entities = vec![
            create_test_entity("namespace_1", "primary_key_1"),
            create_test_entity("namespace_2", "primary_key_2"),
        ];

        let result = select_entity_pair(&entities, None, None, None, None);
        assert!(result.is_ok());
        
        let (left, right) = result.unwrap();
        
        // Verify entities have proper formatting (non-empty strings)
        assert!(!left.pk_namespace.is_empty());
        assert!(!left.pk.is_empty());
        assert!(!right.pk_namespace.is_empty());
        assert!(!right.pk.is_empty());
        
        // Verify they are distinct
        assert!(!(left.pk_namespace == right.pk_namespace && left.pk == right.pk));
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
            let result = select_entity_pair(&entities, None, None, None, None);
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