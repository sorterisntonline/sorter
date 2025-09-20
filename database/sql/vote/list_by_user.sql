SELECT 
    left_entity_pk_namespace,
    left_entity_pk,
    right_entity_pk_namespace,
    right_entity_pk,
    user_id,
    magnitude,
    attribute_id,
    created_at,
    deleted_at
FROM votes 
WHERE user_id = $1 
    AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT COALESCE($2, 100);
