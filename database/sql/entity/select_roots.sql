-- Select entities that have no parents (root entities)
-- Optionally filter by user_id if provided
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
    -- Only show entities that have children (useful for navigation)
    AND EXISTS (
        SELECT 1
        FROM entity_relationships er2
        WHERE er2.parent_ns = e.ns
            AND er2.parent_pk = e.pk
    )
ORDER BY
    e.created_at DESC

