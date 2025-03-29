CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  user_name VARCHAR(255) NOT NULL REFERENCES users(user_name),
  name VARCHAR(255) NOT NULL,
  key_identifier TEXT NOT NULL,
  hashed_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(user_name, name, active)
);

--;;
-- Index for looking up API keys by hashed key
CREATE INDEX idx_api_keys_hashed_key ON api_keys(hashed_key);

--;;
-- Index for looking up user's API keys
CREATE INDEX idx_api_keys_user_name ON api_keys(user_name, active);

-- New index for the key_identifier column
CREATE INDEX idx_api_keys_key_identifier ON api_keys(key_identifier);
--;;