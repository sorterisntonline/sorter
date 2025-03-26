CREATE TABLE perms (
	   tag_id SERIAL NOT NULL REFERENCES tags(id),
	   capability VARCHAR(20) NOT NULL,
	   user_id VARCHAR(20) NOT NULL REFERENCES users(user_name),

	   UNIQUE (tag_id, capability)
);
