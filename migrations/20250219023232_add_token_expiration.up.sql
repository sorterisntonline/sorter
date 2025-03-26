-- Add expires_at column to email_confirmations
ALTER TABLE email_confirmations
ADD COLUMN expires_at TIMESTAMP NOT NULL;
--;;

-- Add expires_at column to password_reset_tokens
ALTER TABLE password_reset_tokens
ADD COLUMN expires_at TIMESTAMP NOT NULL;
--;;

-- Drop the created_at column from password_reset_tokens as it's no longer needed
ALTER TABLE password_reset_tokens
DROP COLUMN created_at;
--;;