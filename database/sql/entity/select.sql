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
WHERE
    pk_namespace = $1
    AND pk = $2
