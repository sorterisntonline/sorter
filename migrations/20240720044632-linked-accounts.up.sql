CREATE TABLE IF NOT EXISTS linked_accounts (
    id SERIAL PRIMARY KEY,
    user_name VARCHAR(20) REFERENCES users(user_name),
    platform VARCHAR(20) NOT NULL,
    platform_user_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_name, platform),
    UNIQUE(platform, platform_user_id)
);
