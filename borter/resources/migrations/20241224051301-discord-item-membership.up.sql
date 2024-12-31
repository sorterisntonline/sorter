ALTER TABLE items_in_tags DROP CONSTRAINT IF EXISTS items_in_tags_pkey;
--;;
ALTER TABLE items_in_tags 
    ADD COLUMN IF NOT EXISTS discord_server_id TEXT,
    ADD COLUMN IF NOT EXISTS discord_channel_id TEXT;
--;;
ALTER TABLE items_in_tags 
    ADD PRIMARY KEY (item_id, tag_id, COALESCE(discord_server_id, ''), COALESCE(discord_channel_id, ''));
