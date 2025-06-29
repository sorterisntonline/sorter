INSERT INTO api_keys(auth0_sub, name, key_identifier, hashed_key, active, created_at)
    VALUES ($1, $2, $3, $4, TRUE, $5)
