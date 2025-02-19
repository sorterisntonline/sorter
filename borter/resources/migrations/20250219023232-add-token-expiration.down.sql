-- Add back the created_at column to password_reset_tokens
ALTER TABLE password_reset_tokens
ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
--;;

-- Remove expires_at column from password_reset_tokens
ALTER TABLE password_reset_tokens
DROP COLUMN expires_at;
--;;

-- Remove expires_at column from email_confirmations
ALTER TABLE email_confirmations
DROP COLUMN expires_at;
--;;