-- Add preview column to api_keys table
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS preview TEXT;
--;;

-- Update existing keys with a default preview
UPDATE api_keys SET preview = 'sort_...' WHERE preview IS NULL;
--;; 