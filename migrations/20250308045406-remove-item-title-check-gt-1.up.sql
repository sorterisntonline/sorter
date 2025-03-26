-- Drop the existing constraint
ALTER TABLE items DROP CONSTRAINT items_title_check;
--;;

-- Add the new constraint with length > 0
ALTER TABLE items ADD CONSTRAINT items_title_check CHECK (length(title) > 0);
--;;
