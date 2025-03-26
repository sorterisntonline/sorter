ALTER TABLE users ADD COLUMN auth0_id TEXT;
--;;

ALTER TABLE users ADD COLUMN pfp_url TEXT;
--;;

CREATE INDEX idx_users_auth0_id ON users(auth0_id);
--;;

CREATE INDEX idx_users_email ON users(email);
--;;
