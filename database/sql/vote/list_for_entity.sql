-- database/sql/vote/list_for_entity.sql
-- Find all votes where the given entity is on either the left or right side
SELECT
    left_entity_pk_namespace,
    left_entity_pk,
    right_entity_pk_namespace,
    right_entity_pk,
    user_id,
    magnitude,
    rationale,
    attribute_id,
    created_at,
    deleted_at
FROM
    votes
WHERE
  (left_entity_pk_namespace = $1 AND left_entity_pk = $2)
  OR
  (right_entity_pk_namespace = $1 AND right_entity_pk = $2)
  AND deleted_at IS NULL
ORDER BY
    created_at DESC
