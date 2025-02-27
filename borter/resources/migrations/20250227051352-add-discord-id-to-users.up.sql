-- Add discord_id column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT;
--;; 

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS users_discord_id_idx ON users(discord_id);
--;; 

-- Add unique constraint to prevent duplicate Discord account links
-- This ensures one Discord ID links to at most one user
ALTER TABLE users ADD CONSTRAINT users_discord_id_unique UNIQUE (discord_id) DEFERRABLE INITIALLY IMMEDIATE;
--;; 

-- Comment
COMMENT ON COLUMN users.discord_id IS 'Discord user ID for linked accounts';
--;; 