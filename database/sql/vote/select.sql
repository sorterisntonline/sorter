SELECT
    left_entity_ns,
    left_entity_pk,
    right_entity_ns,
    right_entity_pk,
    user_id,
    magnitude,
    attribute_id,
    created_at,
    deleted_at
FROM
    votes
WHERE
    left_entity_ns = $1
    AND left_entity_pk = $2
    AND right_entity_ns = $3
    AND right_entity_pk = $4
    AND user_id = $5
    AND attribute_id = $6
    AND deleted_at IS NULL
ORDER BY
    created_at DESC
LIMIT 1
