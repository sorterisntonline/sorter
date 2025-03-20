-- Drop the new constraint
ALTER TABLE items DROP CONSTRAINT items_title_check;
--;;

-- Add back the original constraint with length > 1
ALTER TABLE items ADD CONSTRAINT items_title_check CHECK (length(title) > 1);
--;;
