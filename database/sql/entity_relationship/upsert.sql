INSERT INTO entity_relationships(parent_ns, parent_pk, child_ns, child_pk, user_id)
    VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (parent_ns, parent_pk, child_ns, child_pk)
DO UPDATE SET
    user_id = EXCLUDED.user_id
RETURNING
    parent_ns, parent_pk, child_ns, child_pk, user_id, created_at
