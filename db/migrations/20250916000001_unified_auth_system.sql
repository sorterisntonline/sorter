-- migrate:up

-- Create new provider-agnostic users table structure
-- First add columns without constraints
ALTER TABLE users 
  ADD COLUMN handle text,
  ADD COLUMN display_name text,
  ADD COLUMN primary_provider text;

-- Update existing users with handle values from their username
UPDATE users SET 
  handle = LOWER(REGEXP_REPLACE(username, '[^a-zA-Z0-9_-]', '', 'g')),
  display_name = username,
  primary_provider = 'system'
WHERE handle IS NULL;

-- Now add constraints
ALTER TABLE users 
  ALTER COLUMN handle SET NOT NULL,
  ADD CONSTRAINT users_handle_unique UNIQUE (handle),
  ADD CONSTRAINT users_handle_format CHECK (handle ~ '^[a-zA-Z0-9_-]{1,50}$');

-- Drop auth0_sub after migration
ALTER TABLE users DROP COLUMN auth0_sub;

-- Create providers table for multi-provider auth
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

-- Create user_providers for linking external accounts
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

-- Steam-specific enrichment tables
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

-- Update API keys to reference user_id instead of auth0_sub
ALTER TABLE api_keys 
  DROP COLUMN auth0_sub,
  ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_user_providers_external_id ON user_providers(provider_id, external_id);
CREATE INDEX idx_user_providers_user_id ON user_providers(user_id);
CREATE INDEX idx_steam_user_data_steam_id ON steam_user_data(steam_id);
CREATE INDEX idx_steam_friends_friend_user_id ON steam_friends(friend_user_id);
CREATE INDEX idx_steam_medals_tournament ON steam_medals(tournament_name, medal_type);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Update the api_keys unique constraint
DROP INDEX IF EXISTS api_keys_auth0_sub_name_active_key_idx;
CREATE UNIQUE INDEX api_keys_user_id_name_active_key_idx ON api_keys(user_id, name) 
WHERE active = TRUE;

-- Admin user should already be updated by the bulk update above

-- migrate:down

-- This is a destructive migration, so be careful with rollback
DROP INDEX api_keys_user_id_name_active_key_idx;
DROP TABLE steam_medals;
DROP TABLE steam_friends; 
DROP TABLE steam_user_data;
DROP TABLE user_providers;
DROP TABLE providers;

-- Restore original schema
ALTER TABLE users 
  ADD COLUMN auth0_sub text,
  DROP COLUMN handle,
  DROP COLUMN display_name,
  DROP COLUMN primary_provider;

ALTER TABLE api_keys
  ADD COLUMN auth0_sub text,
  DROP COLUMN user_id;

-- Restore admin user
UPDATE users SET auth0_sub = 'admin' WHERE username = 'admin';

-- Restore indexes
CREATE INDEX ON users(auth0_sub);
CREATE UNIQUE INDEX api_keys_auth0_sub_name_active_key_idx ON api_keys(auth0_sub, name)
WHERE active = TRUE;
