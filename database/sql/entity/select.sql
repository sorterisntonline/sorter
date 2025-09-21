SELECT
    ns,
    pk,
    title,
    metadata,
    created_at,
    profile_picture_url,
    user_id
FROM
    entities
WHERE
    ns = $1
    AND pk = $2
