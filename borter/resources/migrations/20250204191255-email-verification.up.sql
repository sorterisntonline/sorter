-- Update existing NULL emails with a placeholder
UPDATE users 
SET email = CONCAT(user_name, '@placeholder.com')
WHERE email IS NULL;
--;;

-- Make email required and unique
ALTER TABLE users 
  ALTER COLUMN email SET NOT NULL,
  ADD CONSTRAINT users_email_unique UNIQUE (email),
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE;
--;;

-- Create email confirmations table
CREATE TABLE IF NOT EXISTS email_confirmations (
    id SERIAL PRIMARY KEY,
    user_name TEXT NOT NULL REFERENCES users(user_name),
    token TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);