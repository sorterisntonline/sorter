UPDATE
    entities
SET
    title = $3,
    metadata = $4,
    profile_picture_url = $5,
    user_id = $6
WHERE
    pk_namespace = $1
    AND pk = $2
RETURNING
    pk_namespace,
    pk,
    title,
    metadata,
    created_at,
    profile_picture_url,
    user_id
