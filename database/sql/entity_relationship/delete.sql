DELETE FROM entity_relationships
WHERE parent_pk_namespace = $1
    AND parent_pk = $2
    AND child_pk_namespace = $3
    AND child_pk = $4
