CREATE TABLE tokens (
	   owner varchar(20) REFERENCES users(user_name) NOT NULL,
	   domain_pk_namespace TEXT NOT NULL,
	   access_token TEXT NOT NULL,
	   refresh_token TEXT NOT NULl,

	   UNIQUE (owner, domain_pk_namespace)
)
