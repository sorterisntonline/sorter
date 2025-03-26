ALTER TABLE tags ADD CONSTRAINT tags_title_domain_pk_namespace_key 
    UNIQUE (title, domain_pk_namespace);