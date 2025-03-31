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
CREATE TABLE entity_relationships_proposed (
  parent_pk_namespace TEXT NOT NULL,
  parent_pk TEXT NOT NULL,
  child_pk_namespace TEXT NOT NULL,
  child_pk TEXT NOT NULL,
  submitter_user_id UUID REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('add', 'tombstone')),
  submitted_at TIMESTAMP DEFAULT now(),
  PRIMARY KEY (parent_domain, parent_id, child_domain, child_id, submitter_user_id)
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

-- === INDEX RECOMMENDATIONS (optional) ===
-- For efficient queries (example indexes)
CREATE INDEX ON entity_relationships_proposed (parent_pk_namespace, parent_pk);
CREATE INDEX ON entity_relationships_proposed (child_pk_namespace, child_pk);
CREATE INDEX ON entity_permissions (entity_pk_namespace, entity_pk, action);
CREATE INDEX ON users (auth0_sub);
