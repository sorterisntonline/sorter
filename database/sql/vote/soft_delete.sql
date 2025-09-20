UPDATE votes 
SET deleted_at = NOW()
WHERE left_entity_pk_namespace = $1 
    AND left_entity_pk = $2 
    AND right_entity_pk_namespace = $3 
    AND right_entity_pk = $4 
    AND user_id = $5 
    AND attribute_id = $6
    AND deleted_at IS NULL
RETURNING 
    left_entity_pk_namespace,
    left_entity_pk,
    right_entity_pk_namespace,
    right_entity_pk,
    user_id,
    magnitude,
    attribute_id,
    created_at,
    deleted_at;
