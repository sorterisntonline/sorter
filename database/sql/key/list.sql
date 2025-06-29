SELECT
    id,
    auth0_sub,
    name,
    key_identifier,
    hashed_key,
    created_at,
    last_used_at,
    active
FROM
    api_keys
WHERE
    auth0_sub = $1
ORDER BY
    created_at DESC
