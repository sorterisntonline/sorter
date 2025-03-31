-- =============================
-- SORTER CORE SCHEMA (2025)
-- =============================

-- === USERS ===
-- Auth0-based identity + Sorter-specific persona system
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub TEXT NOT NULL, -- links to Auth0 identity
  username TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP DEFAULT now()
);
-- For API authentication
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  auth0_sub TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  key_identifier TEXT NOT NULL,
  hashed_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- === ENTITIES ===
-- Universal, federated objects (posts, tags, songs, albums, datasets...)
CREATE TABLE entities (
  pk_namespace TEXT NOT NULL, -- e.g. 'spotify.album', 'reddit.post', 'sorter.tag'
  pk TEXT NOT NULL,                  -- external or internal ID (e.g. Spotify URI, Reddit ID)
  title TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now(),
  PRIMARY KEY (pk_namespace, pk)
);

-- === PROPOSED ENTITY RELATIONSHIPS ===
-- Anyone can propose child/parent links or tombstone them
CREATE TABLE entity_relationships (
  parent_pk_namespace TEXT NOT NULL,
  parent_pk TEXT NOT NULL,
  child_pk_namespace TEXT NOT NULL,
  child_pk TEXT NOT NULL,
  submitter_user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  PRIMARY KEY (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk)
);

CREATE TABLE attributes (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

INSERT INTO attributes (id, slug, description) VALUES
(0, 'default', 'which do you prefer. what upvoting/liking means on other platforms');

CREATE TABLE votes (
  left_entity_pk_namespace TEXT NOT NULL,
  left_entity_pk TEXT NOT NULL,
  right_entity_pk_namespace TEXT NOT NULL,
  right_entity_pk TEXT NOT NULL,
  voter_user_id UUID REFERENCES users(id),
  magnitude INT NOT NULL,
  attribute_id INT NOT NULL REFERENCES attributes(id),
  PRIMARY KEY (left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, voter_user_id)
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

-- === PERMISSIONS ===
-- Who can vote, add, view, or comment on a tag/entity
CREATE TABLE entity_permissions (
  entity_pk_namespace TEXT NOT NULL,
  entity_pk TEXT NOT NULL,
  action TEXT NOT NULL, -- e.g. 'vote', 'add_child', 'view', 'comment'
  grantee_type TEXT NOT NULL CHECK (grantee_type IN ('public', 'user', 'group', 'auth0_sub')),
  grantee_id TEXT, -- nullable if grantee_type is 'public'
  PRIMARY KEY (entity_pk_namespace, entity_pk, action, grantee_type, grantee_id)
);

CREATE INDEX idx_api_keys_hashed_key ON api_keys(hashed_key);
CREATE INDEX idx_api_keys_key_identifier ON api_keys(key_identifier);

CREATE UNIQUE INDEX api_keys_auth0_sub_name_active_key_idx
ON api_keys (auth0_sub, name)
WHERE active = TRUE;

-- === INDEX RECOMMENDATIONS (optional) ===
-- For efficient queries (example indexes)
CREATE INDEX ON entity_relationships (parent_pk_namespace, parent_pk);
CREATE INDEX ON entity_relationships (child_pk_namespace, child_pk);
CREATE INDEX ON entity_permissions (entity_pk_namespace, entity_pk, action);
CREATE INDEX ON users (auth0_sub);
