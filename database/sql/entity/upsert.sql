INSERT INTO entities(ns, pk, title, metadata, profile_picture_url, user_id)
    VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (ns, pk)
DO UPDATE SET
    title = EXCLUDED.title,
    metadata = EXCLUDED.metadata,
    profile_picture_url = EXCLUDED.profile_picture_url,
    user_id = EXCLUDED.user_id
RETURNING
    ns,
    pk,
    title,
    metadata,
    created_at,
    profile_picture_url,
    user_id


