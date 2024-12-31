-- First remove any existing primary key
ALTER TABLE items_in_tags DROP CONSTRAINT IF EXISTS items_in_tags_pkey;

-- Add the nullable discord columns
ALTER TABLE items_in_tags 
    ADD COLUMN IF NOT EXISTS discord_server_id TEXT,
    ADD COLUMN IF NOT EXISTS discord_channel_id TEXT;

-- Create primary key that allows for the global case (NULL discord fields)
-- and discord-specific cases
ALTER TABLE items_in_tags 
    ADD PRIMARY KEY (item_id, tag_id, COALESCE(discord_server_id, ''), COALESCE(discord_channel_id, ''));
