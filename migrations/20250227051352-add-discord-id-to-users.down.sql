-- Remove index
DROP INDEX IF EXISTS users_discord_id_idx;
--;;

-- Remove unique constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_discord_id_unique;
--;;

-- Remove discord_id column
ALTER TABLE users DROP COLUMN IF EXISTS discord_id;
--;;