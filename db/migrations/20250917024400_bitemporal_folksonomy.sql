-- migrate:up

-- ============================================================================
-- BITEMPORAL FOLKSONOMY SYSTEM
-- ============================================================================
-- This migration implements a sophisticated bitemporal folksonomy system that:
-- 1. Decouples hashtag slugs from entities
-- 2. Allows competitive voting for tag ownership  
-- 3. Tracks both transaction time (when recorded) and valid time (when true)
-- 4. Provides historical views of tag meanings
-- 5. Resists spam through reputation and voting thresholds

-- ============================================================================
-- TAG COLLECTIONS: Competing groups that can claim hashtag slugs
-- ============================================================================
-- Each collection represents a different interpretation of what entities
-- should be associated with a particular hashtag. For example:
-- - Collection 1: #Jedi = Original Trilogy only  
-- - Collection 2: #Jedi = All Disney Canon
-- - Collection 3: #Jedi = Including Legends/EU
CREATE TABLE tag_collections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    creator_user_id uuid REFERENCES users(id) NOT NULL,
    
    -- Bitemporal tracking
    valid_from timestamp NOT NULL DEFAULT now(),
    valid_to timestamp DEFAULT 'infinity'::timestamp,
    transaction_time timestamp NOT NULL DEFAULT now(),
    
    -- Metadata
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    
    -- Ensure valid bitemporal constraints
    CHECK (valid_from <= valid_to),
    CHECK (transaction_time <= created_at)
);

-- ============================================================================
-- TAG CLAIMS: Which collections are competing for which hashtag slugs
-- ============================================================================
-- This is the core competitive mechanism. Multiple collections can claim
-- the same slug, and voting determines the winner.
CREATE TABLE tag_claims (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id uuid REFERENCES tag_collections(id) ON DELETE CASCADE,
    slug text NOT NULL,
    
    -- Bitemporal tracking  
    valid_from timestamp NOT NULL DEFAULT now(),
    valid_to timestamp DEFAULT 'infinity'::timestamp,
    transaction_time timestamp NOT NULL DEFAULT now(),
    
    -- Competition metrics
    vote_count integer NOT NULL DEFAULT 0,
    vote_score numeric(10,2) NOT NULL DEFAULT 0.0,
    last_vote_at timestamp,
    
    -- Reputation requirements (anti-spam)
    min_voter_reputation integer NOT NULL DEFAULT 0,
    requires_approval boolean NOT NULL DEFAULT false,
    
    -- Status tracking
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disputed', 'deprecated', 'spam')),
    
    -- Metadata
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    
    -- Ensure valid bitemporal constraints
    CHECK (valid_from <= valid_to),
    CHECK (transaction_time <= created_at),
    
    -- Unique constraint for active claims
    UNIQUE (slug, collection_id, valid_from, valid_to)
);

-- ============================================================================
-- COLLECTION MEMBERSHIPS: Which entities belong to which collections
-- ============================================================================  
-- This defines what entities are included in each tag collection.
-- An entity can belong to multiple collections with different semantics.
CREATE TABLE collection_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id uuid REFERENCES tag_collections(id) ON DELETE CASCADE,
    entity_pk_namespace text NOT NULL,
    entity_pk text NOT NULL,
    
    -- Bitemporal tracking
    valid_from timestamp NOT NULL DEFAULT now(), 
    valid_to timestamp DEFAULT 'infinity'::timestamp,
    transaction_time timestamp NOT NULL DEFAULT now(),
    
    -- Voting metrics for this specific membership
    vote_count integer NOT NULL DEFAULT 0,
    vote_score numeric(10,2) NOT NULL DEFAULT 0.0,
    last_vote_at timestamp,
    
    -- Membership metadata (why this entity belongs)
    justification text,
    confidence_score numeric(3,2) DEFAULT 1.0 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    
    -- Who added this membership
    added_by_user_id uuid REFERENCES users(id),
    
    -- Metadata
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    
    -- Foreign key to entities table
    FOREIGN KEY (entity_pk_namespace, entity_pk) REFERENCES entities(pk_namespace, pk),
    
    -- Ensure valid bitemporal constraints
    CHECK (valid_from <= valid_to),
    CHECK (transaction_time <= created_at),
    
    -- Unique constraint for active memberships
    UNIQUE (collection_id, entity_pk_namespace, entity_pk, valid_from, valid_to)
);

-- ============================================================================
-- TAG COLLECTION VOTES: Democratic resolution of tag disputes
-- ============================================================================
-- This extends the existing voting system to handle collection vs collection
-- competitions for hashtag ownership.
CREATE TABLE tag_collection_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL,
    left_collection_id uuid REFERENCES tag_collections(id),
    right_collection_id uuid REFERENCES tag_collections(id),
    user_id uuid REFERENCES users(id) NOT NULL,
    
    -- Vote details
    magnitude integer NOT NULL CHECK (magnitude >= -100 AND magnitude <= 100),
    attribute_id integer REFERENCES attributes(id) NOT NULL,
    
    -- Bitemporal tracking
    valid_from timestamp NOT NULL DEFAULT now(),
    valid_to timestamp DEFAULT 'infinity'::timestamp, 
    transaction_time timestamp NOT NULL DEFAULT now(),
    
    -- Vote metadata
    reason text,
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    
    -- Ensure we're not voting for the same collection twice
    CHECK (left_collection_id != right_collection_id),
    
    -- Ensure valid bitemporal constraints
    CHECK (valid_from <= valid_to),
    CHECK (transaction_time <= created_at),
    
    -- Primary key constraint for bitemporal votes
    UNIQUE (slug, left_collection_id, right_collection_id, user_id, attribute_id, valid_from, valid_to)
);

-- ============================================================================
-- USER REPUTATION: Anti-spam and quality control
-- ============================================================================
-- Track user reputation for participating in the folksonomy system
CREATE TABLE user_folksonomy_reputation (
    user_id uuid PRIMARY KEY REFERENCES users(id),
    
    -- Reputation scores
    tag_creation_reputation integer NOT NULL DEFAULT 0,
    voting_reputation integer NOT NULL DEFAULT 0,
    curation_reputation integer NOT NULL DEFAULT 0,
    total_reputation integer NOT NULL DEFAULT 0,
    
    -- Activity metrics
    collections_created integer NOT NULL DEFAULT 0,
    votes_cast integer NOT NULL DEFAULT 0,
    successful_challenges integer NOT NULL DEFAULT 0,
    failed_challenges integer NOT NULL DEFAULT 0,
    
    -- Bitemporal tracking
    valid_from timestamp NOT NULL DEFAULT now(),
    valid_to timestamp DEFAULT 'infinity'::timestamp,
    transaction_time timestamp NOT NULL DEFAULT now(),
    
    -- Metadata
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(),
    
    -- Ensure valid bitemporal constraints  
    CHECK (valid_from <= valid_to),
    CHECK (transaction_time <= created_at),
    CHECK (total_reputation >= 0)
);

-- ============================================================================
-- SLUG RESOLUTION CACHE: Current "winner" for each hashtag  
-- ============================================================================
-- This materialized view/cache table tracks which collection currently
-- "owns" each hashtag slug based on voting results.
CREATE TABLE slug_resolutions (
    slug text PRIMARY KEY,
    winning_collection_id uuid REFERENCES tag_collections(id),
    
    -- Competition metrics
    total_votes integer NOT NULL DEFAULT 0,
    winning_score numeric(10,2) NOT NULL DEFAULT 0.0,
    runner_up_collection_id uuid REFERENCES tag_collections(id),
    runner_up_score numeric(10,2) DEFAULT 0.0,
    margin_of_victory numeric(10,2) DEFAULT 0.0,
    
    -- Temporal tracking
    resolved_at timestamp NOT NULL DEFAULT now(),
    last_challenge_at timestamp,
    next_review_at timestamp,
    
    -- Status
    is_disputed boolean NOT NULL DEFAULT false,
    dispute_threshold_met boolean NOT NULL DEFAULT false,
    
    -- Metadata
    metadata jsonb,
    updated_at timestamp NOT NULL DEFAULT now(),
    
    -- Ensure runner-up is different from winner
    CHECK (winning_collection_id != runner_up_collection_id OR runner_up_collection_id IS NULL)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Tag Collections
CREATE INDEX idx_tag_collections_creator ON tag_collections(creator_user_id);
CREATE INDEX idx_tag_collections_temporal ON tag_collections(valid_from, valid_to, transaction_time);
CREATE INDEX idx_tag_collections_name ON tag_collections(name);

-- Tag Claims  
CREATE INDEX idx_tag_claims_slug ON tag_claims(slug);
CREATE INDEX idx_tag_claims_collection ON tag_claims(collection_id);
CREATE INDEX idx_tag_claims_temporal ON tag_claims(valid_from, valid_to, transaction_time);
CREATE INDEX idx_tag_claims_active ON tag_claims(slug, status) WHERE status = 'active';
CREATE INDEX idx_tag_claims_voting ON tag_claims(slug, vote_score DESC, vote_count DESC);

-- Collection Memberships
CREATE INDEX idx_collection_memberships_collection ON collection_memberships(collection_id);
CREATE INDEX idx_collection_memberships_entity ON collection_memberships(entity_pk_namespace, entity_pk);
CREATE INDEX idx_collection_memberships_temporal ON collection_memberships(valid_from, valid_to, transaction_time);
CREATE INDEX idx_collection_memberships_voting ON collection_memberships(collection_id, vote_score DESC);

-- Tag Collection Votes
CREATE INDEX idx_tag_collection_votes_slug ON tag_collection_votes(slug);
CREATE INDEX idx_tag_collection_votes_user ON tag_collection_votes(user_id);
CREATE INDEX idx_tag_collection_votes_collections ON tag_collection_votes(left_collection_id, right_collection_id);
CREATE INDEX idx_tag_collection_votes_temporal ON tag_collection_votes(valid_from, valid_to, transaction_time);

-- User Reputation
CREATE INDEX idx_user_reputation_total ON user_folksonomy_reputation(total_reputation DESC);
CREATE INDEX idx_user_reputation_temporal ON user_folksonomy_reputation(valid_from, valid_to, transaction_time);

-- Slug Resolutions
CREATE INDEX idx_slug_resolutions_collection ON slug_resolutions(winning_collection_id);
CREATE INDEX idx_slug_resolutions_disputed ON slug_resolutions(is_disputed) WHERE is_disputed = true;
CREATE INDEX idx_slug_resolutions_review ON slug_resolutions(next_review_at);

-- ============================================================================
-- FUNCTIONS FOR BITEMPORAL QUERIES
-- ============================================================================

-- Function to get current tag resolution
CREATE OR REPLACE FUNCTION get_current_tag_resolution(tag_slug text)
RETURNS slug_resolutions AS $$
BEGIN
    RETURN (
        SELECT sr.* 
        FROM slug_resolutions sr 
        WHERE sr.slug = tag_slug
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get historical tag resolution at specific time
CREATE OR REPLACE FUNCTION get_historical_tag_resolution(tag_slug text, at_time timestamp)
RETURNS TABLE (
    collection_id uuid,
    collection_name text,
    vote_score numeric,
    valid_from timestamp,
    valid_to timestamp
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tc.id,
        tc.name,
        tcl.vote_score,
        tcl.valid_from,
        tcl.valid_to
    FROM tag_claims tcl
    JOIN tag_collections tc ON tc.id = tcl.collection_id
    WHERE tcl.slug = tag_slug
      AND tcl.valid_from <= at_time 
      AND tcl.valid_to > at_time
      AND tc.valid_from <= at_time
      AND tc.valid_to > at_time
    ORDER BY tcl.vote_score DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to update slug resolution cache
CREATE OR REPLACE FUNCTION update_slug_resolution(tag_slug text)
RETURNS void AS $$
DECLARE
    winner_rec record;
    runner_up_rec record;
BEGIN
    -- Find the winning collection (highest vote score)
    SELECT 
        tcl.collection_id,
        tcl.vote_score,
        tcl.vote_count
    INTO winner_rec
    FROM tag_claims tcl
    WHERE tcl.slug = tag_slug
      AND tcl.status = 'active'
      AND tcl.valid_to = 'infinity'::timestamp
    ORDER BY tcl.vote_score DESC, tcl.vote_count DESC
    LIMIT 1;
    
    -- Find the runner-up
    SELECT 
        tcl.collection_id,
        tcl.vote_score
    INTO runner_up_rec  
    FROM tag_claims tcl
    WHERE tcl.slug = tag_slug
      AND tcl.status = 'active'
      AND tcl.valid_to = 'infinity'::timestamp
      AND tcl.collection_id != winner_rec.collection_id
    ORDER BY tcl.vote_score DESC, tcl.vote_count DESC
    LIMIT 1;
    
    -- Update or insert resolution
    INSERT INTO slug_resolutions (
        slug,
        winning_collection_id,
        total_votes,
        winning_score,
        runner_up_collection_id,
        runner_up_score,
        margin_of_victory,
        resolved_at,
        updated_at
    ) VALUES (
        tag_slug,
        winner_rec.collection_id,
        winner_rec.vote_count,
        winner_rec.vote_score,
        runner_up_rec.collection_id,
        COALESCE(runner_up_rec.vote_score, 0.0),
        winner_rec.vote_score - COALESCE(runner_up_rec.vote_score, 0.0),
        now(),
        now()
    )
    ON CONFLICT (slug) DO UPDATE SET
        winning_collection_id = EXCLUDED.winning_collection_id,
        total_votes = EXCLUDED.total_votes,
        winning_score = EXCLUDED.winning_score,
        runner_up_collection_id = EXCLUDED.runner_up_collection_id,
        runner_up_score = EXCLUDED.runner_up_score,
        margin_of_victory = EXCLUDED.margin_of_victory,
        resolved_at = EXCLUDED.resolved_at,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Trigger to update slug resolution when tag claims change
CREATE OR REPLACE FUNCTION trigger_update_slug_resolution()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM update_slug_resolution(NEW.slug);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM update_slug_resolution(OLD.slug);
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_slug_resolution_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tag_claims
    FOR EACH ROW EXECUTE FUNCTION trigger_update_slug_resolution();

-- Trigger to update collection vote counts
CREATE OR REPLACE FUNCTION trigger_update_collection_vote_counts()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Update left collection
        UPDATE tag_claims 
        SET vote_count = vote_count + 1,
            vote_score = vote_score + NEW.magnitude,
            last_vote_at = now(),
            updated_at = now()
        WHERE collection_id = NEW.left_collection_id
          AND slug = NEW.slug
          AND valid_to = 'infinity'::timestamp;
          
        -- Update right collection  
        UPDATE tag_claims
        SET vote_count = vote_count + 1,
            vote_score = vote_score - NEW.magnitude,
            last_vote_at = now(),
            updated_at = now()
        WHERE collection_id = NEW.right_collection_id
          AND slug = NEW.slug
          AND valid_to = 'infinity'::timestamp;
          
    ELSIF TG_OP = 'DELETE' THEN
        -- Revert left collection
        UPDATE tag_claims
        SET vote_count = vote_count - 1,
            vote_score = vote_score - OLD.magnitude,
            updated_at = now()
        WHERE collection_id = OLD.left_collection_id
          AND slug = OLD.slug
          AND valid_to = 'infinity'::timestamp;
          
        -- Revert right collection
        UPDATE tag_claims
        SET vote_count = vote_count - 1,
            vote_score = vote_score + OLD.magnitude,
            updated_at = now()
        WHERE collection_id = OLD.right_collection_id
          AND slug = OLD.slug
          AND valid_to = 'infinity'::timestamp;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_collection_vote_counts_trigger
    AFTER INSERT OR UPDATE OR DELETE ON tag_collection_votes
    FOR EACH ROW EXECUTE FUNCTION trigger_update_collection_vote_counts();

-- migrate:down

-- Drop triggers first
DROP TRIGGER IF EXISTS update_collection_vote_counts_trigger ON tag_collection_votes;
DROP TRIGGER IF EXISTS update_slug_resolution_trigger ON tag_claims;

-- Drop functions  
DROP FUNCTION IF EXISTS trigger_update_collection_vote_counts();
DROP FUNCTION IF EXISTS trigger_update_slug_resolution();
DROP FUNCTION IF EXISTS update_slug_resolution(text);
DROP FUNCTION IF EXISTS get_historical_tag_resolution(text, timestamp);
DROP FUNCTION IF EXISTS get_current_tag_resolution(text);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS slug_resolutions;
DROP TABLE IF EXISTS user_folksonomy_reputation;
DROP TABLE IF EXISTS tag_collection_votes;
DROP TABLE IF EXISTS collection_memberships;
DROP TABLE IF EXISTS tag_claims;
DROP TABLE IF EXISTS tag_collections;