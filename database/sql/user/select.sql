SELECT
    auth0_sub,
    username,
    avatar_url,
    bio,
    created_at,
    id
FROM
    users
WHERE
    auth0_sub = $1
