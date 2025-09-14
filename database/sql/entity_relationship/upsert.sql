INSERT INTO entity_relationships(parent_pk_namespace, parent_pk, child_pk_namespace, child_pk, user_id)
    VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk)
DO UPDATE SET
    user_id = EXCLUDED.user_id
RETURNING
    parent_pk_namespace, parent_pk, child_pk_namespace, child_pk, user_id, created_at
