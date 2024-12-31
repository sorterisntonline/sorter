ALTER TABLE items_in_tags 
DROP CONSTRAINT items_in_tags_pkey;
--;;
ALTER TABLE items_in_tags
ADD COLUMN discord_server_id TEXT,
ADD COLUMN discord_channel_id TEXT;
--;;
ALTER TABLE items_in_tags
ADD PRIMARY KEY (item_id, tag_id, discord_server_id, discord_channel_id);
