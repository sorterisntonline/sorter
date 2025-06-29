CREATE TABLE users(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub text NOT NULL,
  username text NOT NULL UNIQUE,
  avatar_url text,
  bio text,
  created_at timestamp DEFAULT now()
);

INSERT INTO users(auth0_sub, username)
  VALUES ('admin', 'admin');

CREATE TABLE api_keys(
  id serial PRIMARY KEY,
  auth0_sub text NOT NULL,
  name text NOT NULL,
  key_identifier text NOT NULL,
  hashed_key text NOT NULL,
  created_at timestamp NOT NULL DEFAULT NOW(),
  last_used_at timestamp,
  active boolean NOT NULL DEFAULT TRUE
);

CREATE TABLE entities(
  pk_namespace text NOT NULL,
  pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  title text,
  profile_picture_url text,
  metadata jsonb,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (pk_namespace, pk)
);

CREATE TABLE entity_relationships(
  parent_pk_namespace text NOT NULL,
  parent_pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  child_pk_namespace text NOT NULL,
  child_pk text NOT NULL,
  created_at timestamp DEFAULT now(),
  PRIMARY KEY (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk)
);

CREATE TABLE attributes(
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  description text NOT NULL
);

INSERT INTO attributes(id, slug, description)
  VALUES (1, 'like', 'which do you prefer. what upvoting/liking means on other platforms');

CREATE TABLE votes(
  left_entity_pk_namespace text NOT NULL,
  left_entity_pk text NOT NULL,
  right_entity_pk_namespace text NOT NULL,
  right_entity_pk text NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  magnitude int NOT NULL,
  attribute_id int NOT NULL REFERENCES attributes(id),
  created_at timestamp DEFAULT now() NOT NULL,
  deleted_at timestamp,
  CHECK ((left_entity_pk_namespace, left_entity_pk) <(right_entity_pk_namespace, right_entity_pk)),
  PRIMARY KEY (left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, user_id, attribute_id, created_at)
);

CREATE TABLE global_slugs(
  slug text PRIMARY KEY,
  pk_namespace text NOT NULL,
  pk text NOT NULL,
  FOREIGN KEY (pk_namespace, pk) REFERENCES entities(pk_namespace, pk)
);

CREATE TABLE scoped_slugs(
  namespace text NOT NULL,
  slug text NOT NULL,
  pk_namespace text NOT NULL,
  pk text NOT NULL,
  PRIMARY KEY (namespace, slug),
  FOREIGN KEY (pk_namespace, pk) REFERENCES entities(pk_namespace, pk)
);

CREATE INDEX idx_api_keys_hashed_key ON api_keys(hashed_key);

CREATE INDEX idx_api_keys_key_identifier ON api_keys(key_identifier);

CREATE UNIQUE INDEX api_keys_auth0_sub_name_active_key_idx ON api_keys(auth0_sub, name)
WHERE
  active = TRUE;

CREATE INDEX ON entity_relationships(parent_pk_namespace, parent_pk);

CREATE INDEX ON entity_relationships(child_pk_namespace, child_pk);

CREATE INDEX ON users(auth0_sub);

