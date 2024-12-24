DROP TABLE users;
CREATE TABLE IF NOT EXISTS users (
    user_name varchar(20) PRIMARY KEY,
    email TEXT,
    password_hash TEXT
);
DROP TABLE access, groups, roles, users_in_groups, items, attributes, votes;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
--;;

CREATE TABLE groups (
	   id SERIAL PRIMARY KEY,

	   user_id varchar(20) NOT NULL REFERENCES users(user_name) ON DELETE CASCADE, -- also used as slug
	   title TEXT NOT NULL,

	   description TEXT NOT NULL,

	   created_at TIMESTAMP NOT NULL DEFAULT NOW(),
	   edited_at TIMESTAMP NOT NULL DEFAULT NOW(),

	   CHECK (length(title) > 1)
);
--;;
CREATE TABLE roles (
	   id SERIAL PRIMARY KEY,

	   group_id integer REFERENCES groups(id) NOT NULL,
	   title TEXT NOT NULL,

	   color TEXT NOT NULL,
	   UNIQUE (group_id, title),
	   CHECK (length(title) > 1)
);
--;;
CREATE TABLE users_in_groups (
	   user_id varchar(20) REFERENCES users(user_name) NOT NULL,
	   group_id integer REFERENCES groups(id) NOT NULL,
	   role_id integer REFERENCES roles(id),

	   PRIMARY KEY (user_id, group_id, role_id)
)
--;;
CREATE TABLE items (
	   id SERIAL PRIMARY KEY,
	   owner varchar(20) REFERENCES users(user_name) NOT NULL,

	   domain_pk_namespace TEXT, -- can be IMG for image rendering
	   domain_pk TEXT, 


	   title TEXT NOT NULL,
	   slug TEXT NOT NULL,

	   body TEXT, -- TODO make this jsonb/edn? only do that if i find use outside current model, cant think of it.
	   url TEXT,
	   -- typ TEXT, not needed for a while i think, domain_pk_namespace can be youtube.com, can adopt convention of org.java.util.customer.namespace/{youtube,github,etc} for type

	   created_at TIMESTAMP NOT NULL DEFAULT NOW(),
	   edited_at TIMESTAMP NOT NULL DEFAULT NOW(),

	   UNIQUE (domain_pk_namespace, domain_pk),
	   CHECK (length(title) > 1)
)
--;;
CREATE TABLE attributes (
	   id SERIAL PRIMARY KEY,
	   owner varchar(20) REFERENCES users(user_name) NOT NULL,

	   title TEXT NOT NULL,
	   description TEXT,

	   created_at TIMESTAMP NOT NULL DEFAULT NOW(),
	   edited_at TIMESTAMP NOT NULL DEFAULT NOW()
)
--;;
CREATE TABLE votes (
	   id SERIAL PRIMARY KEY,
	   owner varchar(20) REFERENCES users(user_name) NOT NULL,

	   domain_pk_namespace TEXT, 
	   left_item_id integer REFERENCES items(id) NOT NULL,
	   right_item_id integer REFERENCES items(id) NOT NULL,
	   magnitude integer NOT NULL CHECK (magnitude >= 0 AND magnitude <= 100),
	   attribute integer REFERENCES attributes(id) NOT NULL,

	   created_at TIMESTAMP NOT NULL DEFAULT NOW(),
	   edited_at TIMESTAMP NOT NULL DEFAULT NOW()
)
--;;
DROP TABLE tags, items_in_tags;
CREATE TABLE tags (
	   id SERIAL PRIMARY KEY,
	   owner varchar(20) REFERENCES users(user_name) NOT NULL,

	   title TEXT NOT NULL,
	   slug TEXT NOT NULL,
	   description TEXT,

	   domain_pk TEXT, -- PLHTRW7dzCGPzAC_kXkSyJ4Ru54Y9dMEjG
	   domain_pk_namespace TEXT, -- youtube.playlist
	   domain_url TEXT, -- for when this references something..

	   created_at TIMESTAMP NOT NULL DEFAULT NOW(),
	   edited_at TIMESTAMP NOT NULL DEFAULT NOW(),

	   UNIQUE (domain_pk_namespace, domain_pk),
	   CHECK (length(title) > 1)
)
--;;
CREATE TABLE items_in_tags (
	   item_id integer REFERENCES items(id) NOT NULL,
	   tag_id integer REFERENCES tags(id) NOT NULL,
	   status integer NOT NULL DEFAULT 0,

	   PRIMARY KEY (item_id, tag_id)
)
ALTER TABLE tags ROP INDEX (slug);
ALTER TABLE tags ADD UNIQUE (slug);
DELETE FROM users WHERE user_name = 'all';
--;;
DELETE FROM users WHERE user_name = 'none';
INSERT INTO users (user_name) VALUES ('all'), ('none');
DROP TABLE perms;
CREATE TABLE perms (
	   tag_id SERIAL NOT NULL REFERENCES tags(id),
	   capability VARCHAR(20) NOT NULL,
	   user_id VARCHAR(20) NOT NULL REFERENCES users(user_name),

	   UNIQUE (tag_id, capability)
);
DROP TABLE tokens;
CREATE TABLE tokens (
	   owner varchar(20) REFERENCES users(user_name) NOT NULL,
	   domain_pk_namespace TEXT NOT NULL,
	   access_token TEXT NOT NULL,
	   refresh_token TEXT NOT NULl,

	   UNIQUE (owner, domain_pk_namespace)
)
DROP TABLE skipped;
CREATE TABLE skipped (
	   owner VARCHAR(20) NOT NULL REFERENCES users(user_name),
	   item_id SERIAL NOT NULL REFERENCES items(id),

	   UNIQUE (owner, item_id)
);

ALTER TABLE perms ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE perms
DROP CONSTRAINT perms_user_id_fkey;
CREATE TABLE comments (
	id SERIAL PRIMARY KEY,
	owner varchar(20) REFERENCES users(user_name) NOT NULL,

	pk_namespace TEXT, -- is this  a comment on an item/tag/vote/nothing
	pk int, -- item this is a comment on

	parent_id int REFERENCES comments(id),
	mirror_id int REFERENCES items(id), -- for when this item is also a comment

	
	body TEXT NOT NULL,

	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE tags ADD COLUMN IF NOT EXISTS ns TEXT DEFAULT NULL; CREATE TABLE usergroups (
	user_name varchar(20) NOT NULL REFERENCES users(user_name) PRIMARY KEY,

	owner varchar(20) NOT NULL REFERENCES users(user_name),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--;;
CREATE TABLE users_in_usergroups (
	usergroup_id varchar(20) NOT NULL REFERENCES usergroups(user_name) ON DELETE CASCADE,
	user_id varchar(20) NOT NULL REFERENCES users(user_name) ON DELETE CASCADE,

	PRIMARY KEY (usergroup_id, user_id)
);

CREATE TABLE IF NOT EXISTS linked_accounts (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(20) REFERENCES users(user_name),
    platform VARCHAR(20) NOT NULL,
    platform_user_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_name, platform),
    UNIQUE(platform, platform_user_id)
);
ALTER TABLE tags ADD COLUMN unlisted BOOLEAN NOT NULL DEFAULT FALSE;
--;;
ALTER TABLE tags ADD COLUMN nsfw BOOLEAN NOT NULL DEFAULT FALSE;
--;;
ALTER TABLE tags ADD COLUMN hide_item_authors BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tags DROP CONSTRAINT tags_slug_key;
--;;
ALTER TABLE tags ADD CONSTRAINT tags_slug_ns_key UNIQUE (slug, ns);
