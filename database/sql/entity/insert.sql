INSERT INTO entities(ns, pk, title, metadata, profile_picture_url, user_id)
    VALUES ($1, $2, $3, $4, $5, $6)
RETURNING
    ns, pk, title, metadata, created_at, profile_picture_url, user_id
