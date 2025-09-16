SELECT
    id,
    username,
    avatar_url,
    bio,
    created_at
FROM
    users
WHERE
    username = $1
