-- Select entities that have no parents (root entities)
SELECT
    e.ns,
    e.pk,
    e.title,
    e.metadata,
    e.created_at,
    e.profile_picture_url,
    e.user_id
FROM
    entities e
WHERE
    NOT EXISTS (
        SELECT 1
        FROM entity_relationships er
        WHERE er.child_ns = e.ns
            AND er.child_pk = e.pk
    )
ORDER BY
    e.created_at DESC

