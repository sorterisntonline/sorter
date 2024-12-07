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
