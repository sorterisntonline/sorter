CREATE TABLE password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_name TEXT NOT NULL REFERENCES users(user_name) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
--;;
-- Index to help with cleanup of expired tokens and looking up by username
CREATE INDEX password_reset_tokens_user_name_idx ON password_reset_tokens(user_name);
--;;
CREATE INDEX password_reset_tokens_created_at_idx ON password_reset_tokens(created_at);
