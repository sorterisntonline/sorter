UPDATE
    api_keys
SET
    active = FALSE,
    last_used_at = $1
WHERE
    user_id = $2
    AND name = $3
    AND active = TRUE
