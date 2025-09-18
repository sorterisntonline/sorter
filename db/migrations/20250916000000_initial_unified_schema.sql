-- migrate:up

-- Users table with unified handle system
CREATE TABLE users(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-zA-Z0-9_-]{1,50}$'),
  display_name text,
  username text NOT NULL UNIQUE, -- Keep for backward compatibility
  primary_provider text,
  avatar_url text,
  bio text,
  created_at timestamp DEFAULT now()
);

-- Insert admin user
INSERT INTO users(handle, display_name, username, primary_provider)
  VALUES ('admin', 'Administrator', 'admin', 'system');

-- Multi-provider authentication system
CREATE TABLE providers (
  id text PRIMARY KEY, -- 'spotify', 'google', etc.
  name text NOT NULL,
  oauth_config jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

-- Insert supported providers
INSERT INTO providers (id, name, enabled) VALUES 
  ('spotify', 'Spotify', true),
  ('google', 'Google', false);

-- Link users to external provider accounts
CREATE TABLE user_providers (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  provider_id text REFERENCES providers(id),
  external_id text NOT NULL, -- Spotify user ID, etc.
  external_username text,
  profile_data jsonb, -- Store rich profile data from provider
  access_token text, -- Encrypted access token if needed
  refresh_token text, -- Encrypted refresh token if needed
  expires_at timestamp,
  linked_at timestamp DEFAULT now(),
  last_sync_at timestamp,
  PRIMARY KEY (user_id, provider_id),
  UNIQUE (provider_id, external_id)
);

-- User session management for web authentication
CREATE TABLE user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE, -- NULL for temp sessions
  session_type text NOT NULL CHECK (session_type IN ('temp', 'full')),
  provider_id text, -- Which provider for temp sessions
  data jsonb, -- Provider-specific data during signup flow
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);

-- Track short-lived OAuth state for provider handshakes
CREATE TABLE oauth_states (
  state text PRIMARY KEY,
  provider_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login', 'link')),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  code_verifier text,
  created_at timestamp DEFAULT now()
);

-- Spotify enrichment data captured during authentication
CREATE TABLE spotify_user_data (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  spotify_user_id text NOT NULL UNIQUE,
  display_name text,
  email text,
  product text,
  avatar_url text,
  last_api_sync timestamp,
  created_at timestamp DEFAULT now()
);

-- API keys for backend authentication
CREATE TABLE api_keys(
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  key_identifier text NOT NULL,
  hashed_key text NOT NULL,
  created_at timestamp NOT NULL DEFAULT NOW(),
  last_used_at timestamp,
  active boolean NOT NULL DEFAULT TRUE
);

-- Core sorter entities system
CREATE TABLE entities(
  pk_namespace text NOT NULL,
  pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  title text,
  profile_picture_url text,
  metadata jsonb,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (pk_namespace, pk)
);

CREATE TABLE entity_relationships(
  parent_pk_namespace text NOT NULL,
  parent_pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  child_pk_namespace text NOT NULL,
  child_pk text NOT NULL,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk),
  FOREIGN KEY (parent_pk_namespace, parent_pk) 
    REFERENCES entities (pk_namespace, pk) 
    ON DELETE CASCADE,
  FOREIGN KEY (child_pk_namespace, child_pk) 
    REFERENCES entities (pk_namespace, pk) 
    ON DELETE CASCADE
);

-- Voting attributes system
CREATE TABLE attributes(
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  description text NOT NULL
);

INSERT INTO attributes(id, slug, description)
  VALUES (1, 'like', 'which do you prefer. what upvoting/liking means on other platforms');

-- Pairwise voting system
CREATE TABLE votes(
  left_entity_pk_namespace text NOT NULL,
  left_entity_pk text NOT NULL,
  right_entity_pk_namespace text NOT NULL,
  right_entity_pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  magnitude int NOT NULL,
  attribute_id int NOT NULL REFERENCES attributes(id),
  created_at timestamp DEFAULT now() NOT NULL,
  deleted_at timestamp,
  CHECK ((left_entity_pk_namespace, left_entity_pk) <(right_entity_pk_namespace, right_entity_pk)),
  PRIMARY KEY (left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, user_id, attribute_id, created_at)
);

-- Slug system for entity discovery
CREATE TABLE global_slugs(
  slug text PRIMARY KEY,
  pk_namespace text NOT NULL,
  pk text NOT NULL,
  FOREIGN KEY (pk_namespace, pk) REFERENCES entities(pk_namespace, pk)
);

CREATE TABLE scoped_slugs(
  namespace text NOT NULL,
  slug text NOT NULL,
  pk_namespace text NOT NULL,
  pk text NOT NULL,
  PRIMARY KEY (namespace, slug),
  FOREIGN KEY (pk_namespace, pk) REFERENCES entities(pk_namespace, pk)
);

-- Performance indexes
CREATE INDEX idx_users_handle ON users(handle);
CREATE INDEX idx_user_providers_external_id ON user_providers(provider_id, external_id);
CREATE INDEX idx_user_providers_user_id ON user_providers(user_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_oauth_states_created_at ON oauth_states(created_at);
CREATE INDEX idx_spotify_user_data_user_id ON spotify_user_data(user_id);

CREATE INDEX idx_api_keys_hashed_key ON api_keys(hashed_key);
CREATE INDEX idx_api_keys_key_identifier ON api_keys(key_identifier);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE UNIQUE INDEX api_keys_user_id_name_active_key_idx ON api_keys(user_id, name) 
WHERE active = TRUE;

CREATE INDEX ON entity_relationships(parent_pk_namespace, parent_pk);
CREATE INDEX ON entity_relationships(child_pk_namespace, child_pk);

-- migrate:down
DROP TABLE votes;
DROP TABLE attributes;
DROP TABLE global_slugs;
DROP TABLE scoped_slugs;
DROP TABLE entity_relationships;
DROP TABLE entities;
DROP TABLE api_keys;
DROP TABLE spotify_user_data;
DROP TABLE user_sessions;
DROP TABLE oauth_states;
DROP TABLE user_providers;
DROP TABLE providers;
DROP TABLE users;
