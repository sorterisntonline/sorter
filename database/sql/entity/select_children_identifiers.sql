SELECT child_pk_namespace as pk_namespace, child_pk as pk FROM entity_relationships WHERE parent_pk_namespace = $1 AND parent_pk = $2 AND child_pk_namespace = $3;
