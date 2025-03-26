-- First remove existing primary key
ALTER TABLE items_in_tags DROP CONSTRAINT IF EXISTS items_in_tags_pkey;
--;;
-- Add the columns if they don't exist
ALTER TABLE items_in_tags 
    ADD COLUMN IF NOT EXISTS discord_server_id TEXT,
    ADD COLUMN IF NOT EXISTS discord_channel_id TEXT;
--;;
-- Create unique index for the global case (when both discord fields are NULL)
CREATE UNIQUE INDEX items_in_tags_global_idx ON items_in_tags (item_id, tag_id) 
WHERE discord_server_id IS NULL AND discord_channel_id IS NULL;
--;;
-- Create unique index for Discord-specific cases
CREATE UNIQUE INDEX items_in_tags_discord_idx ON items_in_tags (item_id, tag_id, discord_server_id, discord_channel_id) 
WHERE discord_server_id IS NOT NULL AND discord_channel_id IS NOT NULL;
