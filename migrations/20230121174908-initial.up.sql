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
