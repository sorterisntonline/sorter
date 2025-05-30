-- =============================
-- SORTER CORE SCHEMA (2025)
-- =============================

-- === USERS ===
-- Auth0-based identity + Sorter-specific persona system + AI model support
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub TEXT NOT NULL, -- links to Auth0 identity (synthetic for AI models)
  username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  is_ai BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE for AI models, FALSE for human users
  created_at TIMESTAMP DEFAULT now()
);

-- For unit testing, create admin user
INSERT INTO users (auth0_sub, username) VALUES ('admin', 'admin');
-- For Spotify API integration
INSERT INTO users (auth0_sub, username) VALUES ('spotify', 'spotify');

-- For API authentication
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  auth0_sub TEXT NOT NULL,
  name TEXT NOT NULL,
  key_identifier TEXT NOT NULL,
  hashed_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- === ENTITIES ===
-- Universal, federated objects (posts, tags, songs, albums, datasets...)
-- Now includes sorter.tag, sorter.item, sorter.lens for WebSocket app
CREATE TABLE entities (
  pk_namespace TEXT NOT NULL, -- e.g. 'spotify.album', 'reddit.post', 'sorter.tag', 'sorter.item', 'sorter.lens'
  pk TEXT NOT NULL,                  -- external or internal ID (e.g. Spotify URI, Reddit ID, UUID for sorter entities)
  user_id UUID REFERENCES users(id) NOT NULL,
  title TEXT,
  profile_picture_url TEXT, -- URL for the entity's primary image
  metadata JSONB, -- For sorter.lens, contains template; for sorter.item, contains text
  created_at TIMESTAMP DEFAULT now(),
  PRIMARY KEY (pk_namespace, pk)
);

-- === PROPOSED ENTITY RELATIONSHIPS ===
-- Anyone can propose child/parent links or tombstone them
-- For WebSocket app: sorter.item -> sorter.tag, sorter.lens -> sorter.tag
CREATE TABLE entity_relationships (
  parent_pk_namespace TEXT NOT NULL,
  parent_pk TEXT NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  child_pk_namespace TEXT NOT NULL,
  child_pk TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  PRIMARY KEY (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk)
);

-- === LEGACY ATTRIBUTES (keep for backward compatibility) ===
CREATE TABLE attributes (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

INSERT INTO attributes (id, slug, description) VALUES
(1, 'like', 'which do you prefer. what upvoting/liking means on other platforms');

-- === VOTES (REFACTORED FOR WEBSOCKET APP) ===
-- Stores AI/human votes using specific lenses on pairs of items within tag contexts
DROP TABLE IF EXISTS votes; -- Clean slate for development
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- New UUID primary key
    left_entity_pk_namespace TEXT NOT NULL DEFAULT 'sorter.item',
    left_entity_pk TEXT NOT NULL,
    right_entity_pk_namespace TEXT NOT NULL DEFAULT 'sorter.item',
    right_entity_pk TEXT NOT NULL,
    voter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- User ID of the Voter (human or AI)
    score INT NOT NULL,
    lens_entity_pk_namespace TEXT NOT NULL DEFAULT 'sorter.lens',
    lens_entity_pk TEXT NOT NULL,         -- UUID of the Lens entity
    tag_entity_pk_namespace TEXT NOT NULL DEFAULT 'sorter.tag',
    tag_entity_pk TEXT NOT NULL,          -- UUID of the parent Tag entity
    rationale TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, -- Use TIMESTAMPTZ

    -- Foreign keys to ensure integrity
    FOREIGN KEY (left_entity_pk_namespace, left_entity_pk) REFERENCES entities(pk_namespace, pk) ON DELETE CASCADE,
    FOREIGN KEY (right_entity_pk_namespace, right_entity_pk) REFERENCES entities(pk_namespace, pk) ON DELETE CASCADE,
    FOREIGN KEY (lens_entity_pk_namespace, lens_entity_pk) REFERENCES entities(pk_namespace, pk) ON DELETE CASCADE,
    FOREIGN KEY (tag_entity_pk_namespace, tag_entity_pk) REFERENCES entities(pk_namespace, pk) ON DELETE CASCADE,

    -- Ensure canonical pair order for the voted items (left < right)
    CHECK ((left_entity_pk_namespace, left_entity_pk) < (right_entity_pk_namespace, right_entity_pk)),

    -- Business key uniqueness: One vote per voter, per lens, per specific pair, per tag
    UNIQUE (left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, voter_user_id, lens_entity_pk_namespace, lens_entity_pk, tag_entity_pk_namespace, tag_entity_pk)
);

-- === GLOBAL SLUGS (PUBLIC URLs) ===
-- Points slugs like '/radiohead' or '/good-kid-maad-city' to one canonical entity
CREATE TABLE global_slugs (
  slug TEXT PRIMARY KEY,
  pk_namespace TEXT NOT NULL,
  pk TEXT NOT NULL,
  FOREIGN KEY (pk_namespace, pk)
    REFERENCES entities(pk_namespace, pk)
);

-- === SCOPED/PERSONAL/ORG SLUGS ===
-- Local namespaces like 'mlcorp/dataset-1' or 'teamX/experimental-tag'
CREATE TABLE scoped_slugs (
  namespace TEXT NOT NULL,
  slug TEXT NOT NULL,
  pk_namespace TEXT NOT NULL,
  pk TEXT NOT NULL,
  PRIMARY KEY (namespace, slug),
  FOREIGN KEY (pk_namespace, pk)
    REFERENCES entities(pk_namespace, pk)
);

-- === INDEXES ===
CREATE INDEX idx_api_keys_hashed_key ON api_keys(hashed_key);
CREATE INDEX idx_api_keys_key_identifier ON api_keys(key_identifier);

CREATE UNIQUE INDEX api_keys_auth0_sub_name_active_key_idx
ON api_keys (auth0_sub, name)
WHERE active = TRUE;

-- User indexes
CREATE INDEX ON users (auth0_sub);
CREATE INDEX idx_users_is_ai_username ON users (is_ai, username);

-- Entity relationship indexes
CREATE INDEX ON entity_relationships (parent_pk_namespace, parent_pk);
CREATE INDEX ON entity_relationships (child_pk_namespace, child_pk);

-- Vote indexes for efficient querying
CREATE INDEX idx_votes_voter_user_id ON votes (voter_user_id);
CREATE INDEX idx_votes_lens_entity ON votes (lens_entity_pk_namespace, lens_entity_pk);
CREATE INDEX idx_votes_tag_entity ON votes (tag_entity_pk_namespace, tag_entity_pk);
CREATE INDEX idx_votes_items_pair ON votes (left_entity_pk, right_entity_pk);
CREATE INDEX idx_votes_created_at ON votes (created_at);

-- Entity indexes for sorter namespaces
CREATE INDEX idx_entities_sorter_tags ON entities (pk_namespace, pk) WHERE pk_namespace = 'sorter.tag';
CREATE INDEX idx_entities_sorter_items ON entities (pk_namespace, pk) WHERE pk_namespace = 'sorter.item';
CREATE INDEX idx_entities_sorter_lenses ON entities (pk_namespace, pk) WHERE pk_namespace = 'sorter.lens';
