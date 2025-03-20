DROP INDEX IF EXISTS idx_users_email;
--;;

DROP INDEX IF EXISTS idx_users_auth0_id;
--;;

ALTER TABLE users DROP COLUMN IF EXISTS pfp_url;
--;;

ALTER TABLE users DROP COLUMN IF EXISTS auth0_id;
--;;
