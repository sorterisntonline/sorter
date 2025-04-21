SELECT
    pk_namespace,
    pk,
    title,
    metadata,
    created_at,
    profile_picture_url,
    user_id
FROM
    entities
ORDER BY
    created_at DESC
