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
  id text PRIMARY KEY, -- 'steam', 'spotify', 'google', etc.
  name text NOT NULL,
  oauth_config jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

-- Insert supported providers
INSERT INTO providers (id, name, enabled) VALUES 
  ('steam', 'Steam', true),
  ('spotify', 'Spotify', false),
  ('google', 'Google', false);

-- Link users to external provider accounts
CREATE TABLE user_providers (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  provider_id text REFERENCES providers(id),
  external_id text NOT NULL, -- Steam ID64, Spotify user ID, etc.
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

-- Steam-specific enrichment tables for TF2 proof-of-skill
CREATE TABLE steam_user_data (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  steam_id text NOT NULL UNIQUE,
  account_created timestamp,
  playtime_tf2 integer DEFAULT 0, -- minutes
  total_games integer DEFAULT 0,
  profile_state integer DEFAULT 0, -- 1=private, 3=public
  vac_banned boolean DEFAULT false,
  game_bans integer DEFAULT 0,
  days_since_last_ban integer,
  last_api_sync timestamp,
  created_at timestamp DEFAULT now()
);

CREATE TABLE steam_friends (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  friend_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  friend_since timestamp,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (user_id, friend_user_id),
  CHECK (user_id != friend_user_id)
);

CREATE TABLE steam_medals (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  item_def_id integer NOT NULL,
  tournament_name text,
  medal_type text, -- 'participant', 'winner', 'runner_up', etc.
  season text,
  division text,
  discovered_at timestamp DEFAULT now(),
  PRIMARY KEY (user_id, item_def_id)
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
  ns text NOT NULL,
  pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  title text,
  profile_picture_url text,
  metadata jsonb,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (ns, pk)
);

CREATE TABLE entity_relationships(
  parent_ns text NOT NULL,
  parent_pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  child_ns text NOT NULL,
  child_pk text NOT NULL,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (parent_ns, parent_pk, child_ns, child_pk),
  FOREIGN KEY (parent_ns, parent_pk) 
    REFERENCES entities (ns, pk) 
    ON DELETE CASCADE,
  FOREIGN KEY (child_ns, child_pk) 
    REFERENCES entities (ns, pk) 
    ON DELETE CASCADE
);

-- Optional per-list behavior configuration so lists can act as allowlists or denylists
CREATE TABLE list_behaviors(
  parent_ns text NOT NULL,
  parent_pk text NOT NULL,
  include_by_default boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  PRIMARY KEY (parent_ns, parent_pk),
  FOREIGN KEY (parent_ns, parent_pk)
    REFERENCES entities (ns, pk)
    ON DELETE CASCADE
);

-- Append-only log of user list actions (allow/deny/reset/temporary block)
CREATE TABLE user_list_actions(
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  list_ns text NOT NULL,
  list_pk text NOT NULL,
  entity_ns text NOT NULL,
  entity_pk text NOT NULL,
  action text NOT NULL CHECK (action IN ('allow', 'deny', 'reset', 'temporary_block')),
  created_at timestamp DEFAULT now() NOT NULL,
  expires_at timestamp,
  FOREIGN KEY (list_ns, list_pk)
    REFERENCES entities (ns, pk)
    ON DELETE CASCADE,
  FOREIGN KEY (entity_ns, entity_pk)
    REFERENCES entities (ns, pk)
    ON DELETE CASCADE
);

CREATE INDEX user_list_actions_lookup_idx
  ON user_list_actions (user_id, list_ns, list_pk, entity_ns, entity_pk, created_at DESC);

CREATE INDEX user_list_actions_active_idx
  ON user_list_actions (user_id, expires_at)
  WHERE expires_at IS NOT NULL;

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
  left_entity_ns text NOT NULL,
  left_entity_pk text NOT NULL,
  right_entity_ns text NOT NULL,
  right_entity_pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  magnitude int NOT NULL,
  attribute_id int NOT NULL REFERENCES attributes(id),
  created_at timestamp DEFAULT now() NOT NULL,
  deleted_at timestamp,

  PRIMARY KEY (left_entity_ns, left_entity_pk, right_entity_ns, right_entity_pk, user_id, attribute_id, created_at)
);

-- Slug system for entity discovery
CREATE TABLE global_slugs(
  slug text PRIMARY KEY,
  ns text NOT NULL,
  pk text NOT NULL,
  FOREIGN KEY (ns, pk) REFERENCES entities(ns, pk)
);

CREATE TABLE scoped_slugs(
  namespace text NOT NULL,
  slug text NOT NULL,
  ns text NOT NULL,
  pk text NOT NULL,
  PRIMARY KEY (namespace, slug),
  FOREIGN KEY (ns, pk) REFERENCES entities(ns, pk)
);

-- Performance indexes
CREATE INDEX idx_users_handle ON users(handle);
CREATE INDEX idx_user_providers_external_id ON user_providers(provider_id, external_id);
CREATE INDEX idx_user_providers_user_id ON user_providers(user_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_steam_user_data_steam_id ON steam_user_data(steam_id);
CREATE INDEX idx_steam_friends_friend_user_id ON steam_friends(friend_user_id);
CREATE INDEX idx_steam_medals_tournament ON steam_medals(tournament_name, medal_type);

CREATE INDEX idx_api_keys_hashed_key ON api_keys(hashed_key);
CREATE INDEX idx_api_keys_key_identifier ON api_keys(key_identifier);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE UNIQUE INDEX api_keys_user_id_name_active_key_idx ON api_keys(user_id, name) 
WHERE active = TRUE;

CREATE INDEX ON entity_relationships(parent_ns, parent_pk);
CREATE INDEX ON entity_relationships(child_ns, child_pk);

-- migrate:down
DROP TABLE votes;
DROP TABLE attributes;
DROP TABLE global_slugs;
DROP TABLE scoped_slugs;
DROP TABLE entity_relationships;
DROP TABLE entities;
DROP TABLE api_keys;
DROP TABLE steam_medals;
DROP TABLE steam_friends; 
DROP TABLE steam_user_data;
DROP TABLE user_sessions;
DROP TABLE user_providers;
DROP TABLE providers;
DROP TABLE users;
