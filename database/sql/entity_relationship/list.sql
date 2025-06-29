SELECT
    parent_pk_namespace,
    parent_pk,
    child_pk_namespace,
    child_pk,
    user_id,
    created_at
FROM
    entity_relationships
WHERE ($1::text IS NULL
    OR parent_pk_namespace = $1::text)
AND ($2::text IS NULL
    OR parent_pk = $2::text)
AND ($3::text IS NULL
    OR child_pk_namespace = $3::text)
AND ($4::text IS NULL
    OR child_pk = $4::text)
AND ($5::uuid IS NULL
    OR user_id = $5::uuid)
ORDER BY
    created_at DESC
