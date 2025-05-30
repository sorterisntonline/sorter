-- Drop tables in reverse order to avoid foreign key constraint issues
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS attributes;
DROP TABLE IF EXISTS scoped_slugs;
DROP TABLE IF EXISTS global_slugs;
DROP TABLE IF EXISTS entity_relationships;
DROP TABLE IF EXISTS entities;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS users;