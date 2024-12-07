CREATE TABLE usergroups (
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

