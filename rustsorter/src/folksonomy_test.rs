// Basic tests for the bitemporal folksonomy system
use sqlx::PgPool;
use uuid::Uuid;

#[tokio::test]
async fn test_basic_table_creation() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/test_db?sslmode=disable".to_string());
    
    let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");
    
    // Test that all our new tables exist
    let table_count: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN (
            'tag_collections', 'tag_claims', 'collection_memberships', 
            'tag_collection_votes', 'user_folksonomy_reputation', 'slug_resolutions'
        )"
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to count tables")
    .unwrap_or(0);
    
    assert_eq!(table_count, 6, "All 6 folksonomy tables should exist");
}

#[tokio::test]
async fn test_basic_collection_workflow() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/test_db?sslmode=disable".to_string());
    
    let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");
    
    // Create a test user first (using existing users table)
    let user_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO users (id, auth0_sub, username) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        user_id,
        format!("test_user_{}", user_id),
        format!("testuser_{}", user_id.to_string()[..8].to_lowercase())
    )
    .execute(&pool)
    .await
    .expect("Failed to create test user");
    
    // Create a tag collection
    let collection_name = "Original Trilogy Jedi";
    let collection_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id) 
         VALUES ($1, $2, $3) RETURNING id",
        collection_name,
        "Jedi from the original Star Wars trilogy only",
        user_id
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to create tag collection");
    
    assert!(collection_id.is_some(), "Collection should be created with UUID");
    let collection_id = collection_id.unwrap();
    
    // Create a tag claim for #Jedi
    let claim_id = sqlx::query_scalar!(
        "INSERT INTO tag_claims (collection_id, slug) VALUES ($1, $2) RETURNING id",
        collection_id,
        "Jedi"
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to create tag claim");
    
    assert!(claim_id.is_some(), "Claim should be created with UUID");
    
    // Verify the claim exists and has correct initial values
    let claim = sqlx::query!(
        "SELECT slug, vote_count, vote_score FROM tag_claims WHERE id = $1",
        claim_id.unwrap()
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to fetch claim");
    
    assert_eq!(claim.slug, "Jedi");
    assert_eq!(claim.vote_count, 0);
    assert_eq!(claim.vote_score, 0.0);
    
    println!("✓ Basic folksonomy workflow test passed");
}

#[tokio::test] 
async fn test_bitemporal_queries() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/test_db?sslmode=disable".to_string());
    
    let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");
    
    // Test that our bitemporal function exists and works
    let result = sqlx::query!(
        "SELECT get_current_tag_resolution('test_slug')"
    )
    .fetch_optional(&pool)
    .await
    .expect("Function should exist and execute");
    
    // It should return None/NULL for non-existent slug
    assert!(result.is_some(), "Function should execute and return result");
    
    println!("✓ Bitemporal query functions working");
}

use bigdecimal::BigDecimal;