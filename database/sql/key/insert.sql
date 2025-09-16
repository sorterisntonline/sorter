INSERT INTO api_keys(user_id, name, key_identifier, hashed_key, active, created_at)
    VALUES ($1, $2, $3, $4, TRUE, $5)
