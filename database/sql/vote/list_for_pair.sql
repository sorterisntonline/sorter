-- database/sql/vote/list_for_pair.sql
-- Find votes between a specific pair of entities
-- Note: The Rust handler MUST ensure that ($1,$2) < ($3,$4) alphabetically
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
  left_entity_pk_namespace = $1
  AND left_entity_pk = $2
  AND right_entity_pk_namespace = $3
  AND right_entity_pk = $4
  AND deleted_at IS NULL
ORDER BY
    created_at DESC
