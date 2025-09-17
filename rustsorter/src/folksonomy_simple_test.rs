// Basic integration test for the simplified folksonomy API
use sqlx::PgPool;
use uuid::Uuid;

#[tokio::test]
async fn test_simplified_folksonomy_tables() {
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
    println!("✓ All folksonomy tables exist");
}

#[tokio::test] 
async fn test_basic_folksonomy_workflow() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/test_db?sslmode=disable".to_string());
    
    let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");
    
    // Create a test user first
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
    
    // Test creating a simple collection
    let collection_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id) 
         VALUES ($1, $2, $3) RETURNING id",
        "Test Collection",
        "A test collection for the folksonomy system",
        user_id
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to create test collection");
    
    // Test creating a tag claim
    let claim_id = sqlx::query_scalar!(
        "INSERT INTO tag_claims (collection_id, slug) VALUES ($1, $2) RETURNING id",
        collection_id,
        "test_tag"
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to create tag claim");
    
    // Test the triggers work by checking initial vote counts
    let claim_data = sqlx::query!(
        "SELECT slug, vote_count, vote_score FROM tag_claims WHERE id = $1",
        claim_id
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to fetch claim data");
    
    assert_eq!(claim_data.slug, "test_tag");
    assert_eq!(claim_data.vote_count, 0);
    // Note: vote_score comes back as BigDecimal from PostgreSQL numeric type
    println!("Vote score type: {:?}", claim_data.vote_score);
    
    println!("✓ Basic folksonomy workflow test passed");
}

#[tokio::test]
async fn test_jedi_example_scenario() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/test_db?sslmode=disable".to_string());
    
    let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");
    
    // Create a test user
    let user_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO users (id, auth0_sub, username) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        user_id,
        format!("jedi_user_{}", user_id),
        format!("jediuser_{}", user_id.to_string()[..8].to_lowercase())
    )
    .execute(&pool)
    .await
    .expect("Failed to create test user");
    
    // Test creating the jedi dispute scenario manually
    let original_trilogy_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "Original Trilogy Jedi",
        "Only characters from the original Star Wars trilogy count as true Jedi",
        user_id
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to create original trilogy collection");
    
    let disney_canon_id = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "Disney Canon Jedi",
        "All Jedi from Disney's official Star Wars canon",
        user_id
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to create disney canon collection");
    
    // Both collections claim the #Jedi tag (with unique test identifier)
    let test_slug = format!("Jedi_{}", user_id.to_string()[..8].to_lowercase());
    for collection_id in [original_trilogy_id, disney_canon_id] {
        sqlx::query!(
            "INSERT INTO tag_claims (collection_id, slug) VALUES ($1, $2)",
            collection_id,
            test_slug
        )
        .execute(&pool)
        .await
        .expect("Failed to create tag claim");
    }
    
    // Check that we have competing claims
    let claim_count: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM tag_claims WHERE slug = $1",
        test_slug
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to count claims")
    .unwrap_or(0);
    
    assert_eq!(claim_count, 2, "Should have 2 competing claims for #{}", test_slug);
    
    // Check that slug resolution was created automatically by trigger
    let resolution_exists: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM slug_resolutions WHERE slug = $1)",
        test_slug
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to check resolution")
    .unwrap_or(false);
    
    assert!(resolution_exists, "Slug resolution should be created automatically");
    
    println!("✓ Jedi dispute scenario test passed - competing collections work!");
}

#[tokio::test]
async fn test_bitemporal_functions() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/test_db?sslmode=disable".to_string());
    
    let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");
    
    // Test that our custom PostgreSQL functions exist by checking pg_proc
    let function_count: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM pg_proc WHERE proname IN ('get_current_tag_resolution', 'get_historical_tag_resolution', 'update_slug_resolution')"
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to count functions")
    .unwrap_or(0);
    
    assert!(function_count >= 3, "Should have at least 3 custom functions");
    
    println!("✓ Bitemporal functions exist in database");
}

#[tokio::test]
async fn test_trigger_functionality() {
    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@localhost:5432/test_db?sslmode=disable".to_string());
    
    let pool = PgPool::connect(&database_url).await.expect("Failed to connect to database");
    
    // Create test data
    let user_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO users (id, auth0_sub, username) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        user_id,
        format!("trigger_user_{}", user_id),
        format!("triggeruser_{}", user_id.to_string()[..8].to_lowercase())
    )
    .execute(&pool)
    .await
    .expect("Failed to create test user");
    
    // Create two collections that will compete for a tag
    let collection_a = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "Collection A",
        "First competing collection",
        user_id
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to create collection A");
    
    let collection_b = sqlx::query_scalar!(
        "INSERT INTO tag_collections (name, description, creator_user_id)
         VALUES ($1, $2, $3) RETURNING id",
        "Collection B", 
        "Second competing collection",
        user_id
    )
    .fetch_one(&pool)
    .await
    .expect("Failed to create collection B");
    
    // Both claim the same tag
    let slug = "test_trigger_tag";
    for collection_id in [collection_a, collection_b] {
        sqlx::query!(
            "INSERT INTO tag_claims (collection_id, slug) VALUES ($1, $2)",
            collection_id,
            slug
        )
        .execute(&pool)
        .await
        .expect("Failed to create tag claim");
    }
    
    // Check that the slug resolution was created automatically
    let resolution = sqlx::query!(
        "SELECT winning_collection_id, total_votes FROM slug_resolutions WHERE slug = $1",
        slug
    )
    .fetch_one(&pool)
    .await
    .expect("Slug resolution should be created by trigger");
    
    assert!(resolution.winning_collection_id.is_some(), "Should have a winning collection");
    assert_eq!(resolution.total_votes, 0, "Should start with 0 votes");
    
    println!("✓ Database triggers working correctly");
}