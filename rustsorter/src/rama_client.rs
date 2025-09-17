use std::{collections::HashMap, sync::Arc};

use anyhow::{Result, anyhow};
use rand::{seq::SliceRandom, thread_rng};
use reqwest::{
    Client,
    StatusCode,
    Url,
    header::{CONTENT_TYPE, HeaderMap, LOCATION},
};
use serde_json::{Value, json};
use tokio::sync::RwLock;
use urlencoding::encode;

/// Lightweight client for Rama's REST API that understands supervisor redirects
/// and sticks to JSON payloads so we can call it from Rust easily.
#[derive(Clone)]
pub struct RamaClient {
    http: Client,
    conductor_base: String,
    module: String,
    encoded_module: String,
    supervisor_cache: Arc<RwLock<HashMap<String, Vec<String>>>>,
}

impl RamaClient {
    pub fn new(conductor_base: impl Into<String>, module: impl Into<String>) -> Self {
        let module: String = module.into();
        let encoded_module = encode(&module).into_owned();

        Self {
            http: Client::new(),
            conductor_base: conductor_base.into().trim_end_matches('/').to_string(),
            module,
            encoded_module,
            supervisor_cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Append an element to the named list.
    pub async fn append_to_list(&self, list: &str, value: &str) -> Result<()> {
        let body = json!({
            "data": {
                "list": list,
                "action": "append",
                "value": value,
            }
        });
        self.post_json("depot/*command-depot/append", &body).await?;
        Ok(())
    }

    /// Clear all values for the named list.
    pub async fn clear_list(&self, list: &str) -> Result<()> {
        let body = json!({
            "data": {
                "list": list,
                "action": "clear",
            }
        });
        self.post_json("depot/*command-depot/append", &body).await?;
        Ok(())
    }

    /// Fetch the current list contents. Returns an empty vector if the list is
    /// unset.
    pub async fn get_list(&self, list: &str) -> Result<Vec<String>> {
        let path = json!([list]);
        let response = self.post_json("pstate/$$lists/selectOne", &path).await?;

        match response {
            Value::Null => Ok(Vec::new()),
            Value::Array(items) => {
                let mut out = Vec::with_capacity(items.len());
                for value in items {
                    match value {
                        Value::String(s) => out.push(s),
                        other => out.push(other.to_string()),
                    }
                }
                Ok(out)
            }
            other => Err(anyhow!(
                "unexpected Rama response for list query: {}",
                other
            )),
        }
    }

    async fn post_json(&self, endpoint: &str, payload: &Value) -> Result<Value> {
        let body = serde_json::to_string(payload)?;
        let mut attempts = 0;
        let mut candidates = self.supervisor_candidates().await;
        let mut last_error: Option<anyhow::Error> = None;

        while attempts < 5 {
            let target = if let Some(url) = candidates.pop() {
                url
            } else {
                self.conductor_base.clone()
            };

            let url = format!(
                "{}/rest/{}/{}",
                target.trim_end_matches('/'),
                self.encoded_module,
                endpoint
            );

            match self
                .http
                .post(url)
                .header(CONTENT_TYPE, "text/plain")
                .body(body.clone())
                .send()
                .await
            {
                Ok(resp) => {
                    if resp.status() == StatusCode::PERMANENT_REDIRECT {
                        let headers = resp.headers().clone();
                        if let Some(mut supervisor_urls) = Self::parse_supervisors(&headers) {
                            self.update_supervisor_cache(supervisor_urls.clone()).await;
                            supervisor_urls.shuffle(&mut thread_rng());
                            candidates = supervisor_urls;
                            attempts += 1;
                            continue;
                        }

                        if let Some(location) =
                            headers.get(LOCATION).and_then(|value| value.to_str().ok())
                        {
                            if let Ok(url) = Url::parse(location) {
                                let mut base = format!(
                                    "{}://{}",
                                    url.scheme(),
                                    url.host_str().unwrap_or_default()
                                );
                                if let Some(port) = url.port() {
                                    base = format!("{}:{}", base, port);
                                }
                                candidates = vec![base];
                            } else {
                                candidates = vec![location.to_string()];
                            }
                            attempts += 1;
                            continue;
                        }

                        last_error = Some(anyhow!("received redirect without supervisor info"));
                        attempts += 1;
                        continue;
                    }

                    if resp.status().is_success() {
                        let headers = resp.headers().clone();
                        if let Some(mut supervisors) = Self::parse_supervisors(&headers) {
                            supervisors.shuffle(&mut thread_rng());
                            self.update_supervisor_cache(supervisors).await;
                        }

                        let text = resp.text().await?;
                        if text.trim().is_empty() {
                            return Ok(Value::Null);
                        }

                        let parsed: Value = serde_json::from_str(&text)
                            .map_err(|err| anyhow!("failed to parse Rama JSON: {}", err))?;
                        return Ok(parsed);
                    }

                    let status = resp.status();
                    let text = resp.text().await.unwrap_or_default();
                    last_error = Some(anyhow!(
                        "Rama request failed: status={} body={}",
                        status,
                        text
                    ));
                }
                Err(err) => {
                    last_error = Some(err.into());
                }
            }

            attempts += 1;
        }

        Err(last_error.unwrap_or_else(|| anyhow!("unable to reach Rama")))
    }

    async fn supervisor_candidates(&self) -> Vec<String> {
        let cache = self.supervisor_cache.read().await;
        if let Some(existing) = cache.get(&self.module) {
            let mut shuffled = existing.clone();
            shuffled.shuffle(&mut thread_rng());
            return shuffled;
        }
        Vec::new()
    }

    async fn update_supervisor_cache(&self, supervisors: Vec<String>) {
        if supervisors.is_empty() {
            return;
        }
        let mut cache = self.supervisor_cache.write().await;
        cache.insert(self.module.clone(), supervisors);
    }

    fn parse_supervisors(headers: &HeaderMap) -> Option<Vec<String>> {
        headers
            .get("Supervisor-Locations")
            .and_then(|value| value.to_str().ok())
            .and_then(|raw| serde_json::from_str::<Vec<String>>(raw).ok())
            .map(|hosts| {
                hosts
                    .into_iter()
                    .map(|host| format!("http://{}", host))
                    .collect()
            })
    }
}
