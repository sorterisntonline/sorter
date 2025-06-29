INSERT INTO entities(pk_namespace, pk, title, metadata, profile_picture_url, user_id)
    VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT
    DO NOTHING
RETURNING
    pk_namespace, pk, title, metadata, created_at, profile_picture_url, user_id
