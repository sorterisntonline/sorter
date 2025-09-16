use std::env;

use anyhow::{anyhow, Context, Result};
use url::Url;

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub port: u16,
    pub steam_api_key: String,
    pub base_url: String,
    pub frontend_url: String,
    pub static_dir: Option<String>,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        let database_url = env::var("DATABASE_URL")
            .map(|value| value.trim().to_string())
            .context("DATABASE_URL must be set")?;

        if !database_url.starts_with("postgres://") {
            return Err(anyhow!("DATABASE_URL must start with postgres://"));
        }

        let port = env::var("PORT")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.parse::<u16>())
            .transpose()
            .map_err(|_| anyhow!("PORT must be a valid u16 integer"))?
            .unwrap_or(8081);

        let steam_api_key = env::var("STEAM_API_KEY")
            .map(|value| value.trim().to_string())
            .context("STEAM_API_KEY must be set")?;

        if steam_api_key.is_empty() {
            return Err(anyhow!("STEAM_API_KEY must be a non-empty string"));
        }

        let base_url = env::var("BASE_URL")
            .ok()
            .and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            })
            .unwrap_or_else(|| format!("http://localhost:{}", port));
        Url::parse(&base_url).context("BASE_URL must be a valid URL")?;

        let frontend_url = env::var("FRONTEND_URL")
            .ok()
            .and_then(|value| {
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            })
            .unwrap_or_else(|| "http://localhost:5173".to_string());
        Url::parse(&frontend_url).context("FRONTEND_URL must be a valid URL")?;

        let static_dir = env::var("STATIC_DIR")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        Ok(Self {
            database_url,
            port,
            steam_api_key,
            base_url,
            frontend_url,
            static_dir,
        })
    }
}
