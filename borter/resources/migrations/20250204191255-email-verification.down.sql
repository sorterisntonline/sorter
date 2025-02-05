-- Drop email confirmations table
DROP TABLE IF EXISTS email_confirmations;

-- Revert users table changes
ALTER TABLE users 
  ALTER COLUMN email DROP NOT NULL,
  DROP CONSTRAINT users_email_unique,
  DROP COLUMN email_verified;