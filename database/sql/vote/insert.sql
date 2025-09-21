INSERT INTO votes(left_entity_ns, left_entity_pk, right_entity_ns, right_entity_pk, magnitude, attribute_id, user_id, deleted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
RETURNING
    left_entity_ns, left_entity_pk, right_entity_ns, right_entity_pk, magnitude, attribute_id, user_id, created_at, deleted_at
