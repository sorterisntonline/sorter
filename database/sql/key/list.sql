SELECT
    id,
    user_id,
    name,
    key_identifier,
    hashed_key,
    created_at,
    last_used_at,
    active
FROM
    api_keys
WHERE
    user_id = $1
ORDER BY
    created_at DESC
