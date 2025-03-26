ALTER TABLE tags DROP CONSTRAINT tags_slug_key;
--;;
ALTER TABLE tags ADD CONSTRAINT tags_slug_ns_key UNIQUE (slug, ns);
