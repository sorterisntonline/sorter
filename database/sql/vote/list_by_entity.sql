SELECT 
    v.left_entity_pk_namespace as left_ns,
    v.left_entity_pk as left_pk,
    v.right_entity_pk_namespace as right_ns, 
    v.right_entity_pk as right_pk,
    v.user_id,
    v.attribute_id as attr_id,
    v.magnitude,
    v.created_at,
    CASE 
        WHEN v.left_entity_pk_namespace = $1 AND v.left_entity_pk = $2 THEN 
            CONCAT(v.right_entity_pk_namespace, ':', v.right_entity_pk)
        ELSE 
            CONCAT(v.left_entity_pk_namespace, ':', v.left_entity_pk)
    END as opponent_id,
    CASE 
        WHEN v.left_entity_pk_namespace = $1 AND v.left_entity_pk = $2 THEN 
            COALESCE(e2.title, v.right_entity_pk)
        ELSE 
            COALESCE(e1.title, v.left_entity_pk)
    END as opponent_title
FROM votes v
LEFT JOIN entities e1 ON v.left_entity_pk_namespace = e1.pk_namespace AND v.left_entity_pk = e1.pk
LEFT JOIN entities e2 ON v.right_entity_pk_namespace = e2.pk_namespace AND v.right_entity_pk = e2.pk
WHERE (v.left_entity_pk_namespace = $1 AND v.left_entity_pk = $2) 
   OR (v.right_entity_pk_namespace = $1 AND v.right_entity_pk = $2)
   AND v.deleted_at IS NULL
ORDER BY v.created_at DESC
LIMIT $3;
