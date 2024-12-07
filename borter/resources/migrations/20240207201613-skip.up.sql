CREATE TABLE skipped (
	   owner VARCHAR(20) NOT NULL REFERENCES users(user_name),
	   item_id SERIAL NOT NULL REFERENCES items(id),

	   UNIQUE (owner, item_id)
);

