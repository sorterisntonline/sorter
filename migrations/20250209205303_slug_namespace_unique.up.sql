-- First drop the existing unique constraint on slug
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_slug_key;
--;;
-- Drop the title+namespace constraint as it's redundant with our new approach
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_title_domain_pk_namespace_key;
--;;
-- Add new composite unique constraint for namespace+slug
ALTER TABLE tags ADD CONSTRAINT tags_namespace_slug_key 
    UNIQUE (domain_pk_namespace, slug);
