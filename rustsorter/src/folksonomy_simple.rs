// Simplified folksonomy implementation focusing on core concepts
use aide::axum::{ApiRouter, routing::{get_with, post_with}};
use axum::{
    extract::State,
    http::StatusCode,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    app_state::AppState,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, Json, MapErrorSqlx, CapitalizedString},
};

// ============================================================================
// SIMPLIFIED DATA STRUCTURES
// ============================================================================

#[derive(Serialize, Debug, Clone, JsonSchema)]
pub struct SimpleFolksonomyInfo {
    pub message: String,
    pub tables_created: bool,
    pub example_concepts: Vec<ExampleConcept>,
}

#[derive(Serialize, Debug, Clone, JsonSchema)]
pub struct ExampleConcept {
    pub problem: String,
    pub solution: String,
    pub example: String,
}

#[derive(Serialize, Debug, Clone, JsonSchema)]
pub struct DatabaseStats {
    pub tag_collections_count: i64,
    pub tag_claims_count: i64,
    pub collection_memberships_count: i64,
    pub votes_count: i64,
    pub reputation_entries_count: i64,
    pub slug_resolutions_count: i64,
}

#[derive(Deserialize, JsonSchema)]
pub struct CreateExampleDataPayload {
    pub scenario: String, // "jedi_dispute", "synonyms", "personal_tags"
}

// ============================================================================
// ROUTE HANDLERS 
// ============================================================================

async fn get_folksonomy_info() -> Result<Json<SimpleFolksonomyInfo>, Error> {
    let info = SimpleFolksonomyInfo {
        message: "Bitemporal Folksonomy System - Competitive Democratic Tagging".to_string(),
        tables_created: true,
        example_concepts: vec![
            ExampleConcept {
                problem: "Synonymy (car vs auto vs vehicle)".to_string(),
                solution: "Multiple collections can compete for the same #transportation tag with different inclusion criteria".to_string(),
                example: "Collection A: #vehicle = [cars, trucks, motorcycles], Collection B: #vehicle = [all motorized transport including boats]".to_string(),
            },
            ExampleConcept {
                problem: "Polysemy (bank -> river or finance)".to_string(),
                solution: "Context-specific collections that users vote between based on usage context".to_string(),
                example: "#bank could point to 'Financial Institutions' collection or 'Geographical Features' collection based on voting".to_string(),
            },
            ExampleConcept {
                problem: "No hierarchy (dog picture tagged as #pet #golden-retriever #dog), searches miss".to_string(),
                solution: "Collections can include hierarchical relationships and users vote on which collection best represents the tag".to_string(),
                example: "#dog collection could include all canines, while #pet collection includes dogs + cats + birds".to_string(),
            },
            ExampleConcept {
                problem: "Personal tags don't work (#toread #my_project)".to_string(),
                solution: "Private collections that only the user can see and manage, plus public collections for shared semantics".to_string(),
                example: "User's private #toread collection vs community #books_worth_reading collection".to_string(),
            },
            ExampleConcept {
                problem: "Spam and gaming".to_string(),
                solution: "Reputation-based voting rights and time-based review cycles for tag ownership".to_string(),
                example: "Only users with >100 reputation can vote, contested tags reviewed every 30 days".to_string(),
            },
        ],
    };
    
    Ok(Json(info))
}

async fn get_database_stats(State(state): State<AppState>) -> Result<Json<DatabaseStats>, Error> {
    let pool = &state.db;
    
    // Check if our tables exist and get counts
    let tag_collections_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM tag_collections"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);
    
    let tag_claims_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM tag_claims"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);
    
    let collection_memberships_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM collection_memberships"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);
    
    let votes_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM tag_collection_votes"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);
    
    let reputation_entries_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM user_folksonomy_reputation"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);
    
    let slug_resolutions_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM slug_resolutions"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);
    
    let stats = DatabaseStats {
        tag_collections_count,
        tag_claims_count,
        collection_memberships_count,
        votes_count,
        reputation_entries_count,
        slug_resolutions_count,
    };
    
    Ok(Json(stats))
}

async fn create_example_scenario(
    State(state): State<AppState>,
    AuthenticatedUser(user): AuthenticatedUser,
    Json(payload): Json<CreateExampleDataPayload>,
) -> Result<(StatusCode, Json<SimpleFolksonomyInfo>), Error> {
    let pool = &state.db;
    
    match payload.scenario.as_str() {
        "jedi_dispute" => {
            create_jedi_dispute_example(pool, user.id).await?;
        },
        "synonyms" => {
            create_synonyms_example(pool, user.id).await?;
        },
        "personal_tags" => {
            create_personal_tags_example(pool, user.id).await?;
        },
        _ => {
            return Err(Error::BadRequest { 
                message: CapitalizedString::from("Unknown scenario. Use: jedi_dispute, synonyms, or personal_tags")
            });
        }
    }
    
    let info = SimpleFolksonomyInfo {
        message: format!("Successfully created example scenario: {}", payload.scenario),
        tables_created: true,
        example_concepts: vec![],
    };
    
    Ok((StatusCode::CREATED, Json(info)))
}

// ============================================================================
// EXAMPLE SCENARIO CREATORS
// ============================================================================

async fn create_jedi_dispute_example(pool: &PgPool, user_id: Uuid) -> Result<(), Error> {
    // Create three competing collections for #Jedi
    
    // Collection 1: Original Trilogy purists
    let original_trilogy_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "Original Trilogy Jedi",
        "Only characters from the original Star Wars trilogy (1977-1983) count as true Jedi",
        user_id
    )
    .fetch_one(pool)
    .await
    .map_error("tag collection")?;
    
    // Collection 2: Disney Canon 
    let disney_canon_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "Disney Canon Jedi",
        "All Jedi from Disney's official Star Wars canon including sequels and shows",
        user_id
    )
    .fetch_one(pool)
    .await
    .map_error("tag collection")?;
    
    // Collection 3: Legends/EU inclusive
    let legends_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "Legends Universe Jedi",
        "All Jedi from original EU/Legends continuity including books and games",
        user_id
    )
    .fetch_one(pool)
    .await
    .map_error("tag collection")?;
    
    // Create claims for the #Jedi slug
    for collection_id in [original_trilogy_id, disney_canon_id, legends_id] {
        sqlx::query!(
            "INSERT INTO tag_claims (collection_id, slug) VALUES ($1, $2)",
            collection_id,
            "Jedi"
        )
        .execute(pool)
        .await
        .map_error("tag claim")?;
    }
    
    // Add some example members to each collection
    let luke_entity = ("starwars.character", "luke_skywalker");
    let rey_entity = ("starwars.character", "rey");
    let mara_jade_entity = ("starwars.character", "mara_jade");
    
    // Luke is in all collections
    for collection_id in [original_trilogy_id, disney_canon_id, legends_id] {
        sqlx::query!(
            "INSERT INTO collection_memberships 
             (collection_id, entity_pk_namespace, entity_pk, justification, added_by_user_id)
             VALUES ($1, $2, $3, $4, $5)",
            collection_id,
            luke_entity.0,
            luke_entity.1,
            "Luke Skywalker appears in all continuities",
            user_id
        )
        .execute(pool)
        .await
        .map_error("collection membership")?;
    }
    
    // Rey is only in Disney Canon
    sqlx::query!(
        "INSERT INTO collection_memberships 
         (collection_id, entity_pk_namespace, entity_pk, justification, added_by_user_id)
         VALUES ($1, $2, $3, $4, $5)",
        disney_canon_id,
        rey_entity.0,
        rey_entity.1,
        "Rey is a sequel trilogy character, Disney canon only",
        user_id
    )
    .execute(pool)
    .await
    .map_error("collection membership")?;
    
    // Mara Jade is only in Legends
    sqlx::query!(
        "INSERT INTO collection_memberships 
         (collection_id, entity_pk_namespace, entity_pk, justification, added_by_user_id)
         VALUES ($1, $2, $3, $4, $5)",
        legends_id,
        mara_jade_entity.0,
        mara_jade_entity.1,
        "Mara Jade is from the EU/Legends books",
        user_id
    )
    .execute(pool)
    .await
    .map_error("collection membership")?;
    
    Ok(())
}

async fn create_synonyms_example(pool: &PgPool, user_id: Uuid) -> Result<(), Error> {
    // Create collections that demonstrate synonym handling
    
    let automotive_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "Automotive Vehicles",
        "Road vehicles: cars, trucks, motorcycles, etc.",
        user_id
    )
    .fetch_one(pool)
    .await
    .map_error("tag collection")?;
    
    let all_transport_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "All Transportation",
        "Any mode of transport: cars, boats, planes, trains, bikes",
        user_id
    )
    .fetch_one(pool)
    .await
    .map_error("tag collection")?;
    
    // Both collections compete for related slugs
    for slug in ["vehicle", "transport", "car", "auto"] {
        for collection_id in [automotive_id, all_transport_id] {
            sqlx::query!(
                "INSERT INTO tag_claims (collection_id, slug) VALUES ($1, $2)",
                collection_id,
                slug
            )
            .execute(pool)
            .await
            .map_error("tag claim")?;
        }
    }
    
    Ok(())
}

async fn create_personal_tags_example(pool: &PgPool, user_id: Uuid) -> Result<(), Error> {
    // Create personal vs public collections
    
    let personal_reading_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id, metadata)
         VALUES ($1, $2, $3, $4) RETURNING id",
        "My Reading List",
        "Personal books and articles I want to read",
        user_id,
        serde_json::json!({"visibility": "private", "personal": true})
    )
    .fetch_one(pool)
    .await
    .map_error("tag collection")?;
    
    let community_reading_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id, metadata)
         VALUES ($1, $2, $3, $4) RETURNING id",
        "Community Recommended Reading",
        "Books and articles recommended by the community",
        user_id,
        serde_json::json!({"visibility": "public", "community_curated": true})
    )
    .fetch_one(pool)
    .await
    .map_error("tag collection")?;
    
    // Both could claim #toread but for different purposes
    for collection_id in [personal_reading_id, community_reading_id] {
        sqlx::query!(
            "INSERT INTO tag_claims (collection_id, slug, metadata) VALUES ($1, $2, $3)",
            collection_id,
            "toread",
            if collection_id == personal_reading_id {
                serde_json::json!({"scope": "personal"})
            } else {
                serde_json::json!({"scope": "community"})
            }
        )
        .execute(pool)
        .await
        .map_error("tag claim")?;
    }
    
    Ok(())
}

// ============================================================================
// ROUTING
// ============================================================================

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route(
            "/info",
            get_with(get_folksonomy_info, |op| {
                op.description("Get information about the bitemporal folksonomy system.")
                    .response::<200, Json<SimpleFolksonomyInfo>>()
            }),
        )
        .api_route(
            "/stats",
            get_with(get_database_stats, |op| {
                op.description("Get database statistics for folksonomy tables.")
                    .response::<200, Json<DatabaseStats>>()
            }),
        )
        .api_route(
            "/examples",
            post_with(create_example_scenario, |op| {
                op.description("Create example data scenarios to demonstrate folksonomy concepts.")
                    .response::<201, Json<SimpleFolksonomyInfo>>()
            }),
        )
}