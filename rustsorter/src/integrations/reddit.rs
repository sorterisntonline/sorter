use governor::{Quota, RateLimiter, Jitter};
use nonzero_ext::nonzero;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use anyhow::{Result, Context, anyhow};

/// Reddit API client with built-in rate limiting
pub struct RedditClient {
    client: Client,
    limiter: Arc<governor::DefaultDirectRateLimiter>,
    user_agent: String,
}

impl RedditClient {
    /// Create a new Reddit client with rate limiting
    /// Reddit API allows 60 requests per minute for OAuth2 authenticated apps
    /// We'll be conservative and use 50 requests per minute
    pub fn new() -> Self {
        // Create rate limiter: 50 requests per minute
        let quota = Quota::per_minute(nonzero!(50u32));
        let limiter = Arc::new(RateLimiter::direct(quota));
        
        // Create HTTP client with timeout
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");
        
        // Reddit requires a unique user agent
        let user_agent = format!(
            "rust:sorter:v{} (by /u/hourLong_arnould)",
            env!("CARGO_PKG_VERSION")
        );
        
        Self {
            client,
            limiter,
            user_agent,
        }
    }
    
    /// Fetch hot posts from a subreddit
    pub async fn get_subreddit_hot(&self, subreddit: &str, limit: usize) -> Result<RedditListingResponse> {
        // Wait for rate limiter
        self.limiter.until_ready_with_jitter(Jitter::up_to(Duration::from_millis(100))).await;
        
        let url = format!("https://www.reddit.com/r/{}/hot.json?limit={}", subreddit, limit);
        
        let response = self.client
            .get(&url)
            .header("User-Agent", &self.user_agent)
            .send()
            .await
            .context("Failed to send request to Reddit")?;
        
        self.handle_response(response).await
    }
    
    /// Fetch top posts from a subreddit
    pub async fn get_subreddit_top(&self, subreddit: &str, limit: usize, time_period: &str) -> Result<RedditListingResponse> {
        self.limiter.until_ready_with_jitter(Jitter::up_to(Duration::from_millis(100))).await;
        
        let url = format!(
            "https://www.reddit.com/r/{}/top.json?limit={}&t={}",
            subreddit, limit, time_period
        );
        
        let response = self.client
            .get(&url)
            .header("User-Agent", &self.user_agent)
            .send()
            .await
            .context("Failed to send request to Reddit")?;
        
        self.handle_response(response).await
    }
    
    /// Fetch new posts from a subreddit
    pub async fn get_subreddit_new(&self, subreddit: &str, limit: usize) -> Result<RedditListingResponse> {
        self.limiter.until_ready_with_jitter(Jitter::up_to(Duration::from_millis(100))).await;
        
        let url = format!("https://www.reddit.com/r/{}/new.json?limit={}", subreddit, limit);
        
        let response = self.client
            .get(&url)
            .header("User-Agent", &self.user_agent)
            .send()
            .await
            .context("Failed to send request to Reddit")?;
        
        self.handle_response(response).await
    }
    
    /// Fetch a specific post and its comments
    pub async fn get_post(&self, subreddit: &str, post_id: &str) -> Result<Vec<RedditListingResponse>> {
        self.limiter.until_ready_with_jitter(Jitter::up_to(Duration::from_millis(100))).await;
        
        let url = format!(
            "https://www.reddit.com/r/{}/comments/{}.json",
            subreddit, post_id
        );
        
        let response = self.client
            .get(&url)
            .header("User-Agent", &self.user_agent)
            .send()
            .await
            .context("Failed to send request to Reddit")?;
        
        match response.status() {
            StatusCode::OK => {
                let listings: Vec<RedditListingResponse> = response
                    .json()
                    .await
                    .context("Failed to parse Reddit response")?;
                Ok(listings)
            }
            StatusCode::TOO_MANY_REQUESTS => {
                Err(anyhow!("Reddit rate limit exceeded. Please try again later."))
            }
            StatusCode::NOT_FOUND => {
                Err(anyhow!("Post not found: r/{}/comments/{}", subreddit, post_id))
            }
            status => {
                Err(anyhow!("Reddit API error: {}", status))
            }
        }
    }
    
    /// Fetch user profile (posts and comments)
    pub async fn get_user_profile(&self, username: &str, content_type: &str, limit: usize) -> Result<RedditListingResponse> {
        self.limiter.until_ready_with_jitter(Jitter::up_to(Duration::from_millis(100))).await;
        
        let url = format!(
            "https://www.reddit.com/user/{}/{}.json?limit={}",
            username, content_type, limit
        );
        
        let response = self.client
            .get(&url)
            .header("User-Agent", &self.user_agent)
            .send()
            .await
            .context("Failed to send request to Reddit")?;
        
        self.handle_response(response).await
    }
    
    /// Handle Reddit API response with proper error checking
    async fn handle_response(&self, response: reqwest::Response) -> Result<RedditListingResponse> {
        match response.status() {
            StatusCode::OK => {
                let listing: RedditListingResponse = response
                    .json()
                    .await
                    .context("Failed to parse Reddit response")?;
                Ok(listing)
            }
            StatusCode::TOO_MANY_REQUESTS => {
                Err(anyhow!("Reddit rate limit exceeded. Please try again later."))
            }
            StatusCode::NOT_FOUND => {
                Err(anyhow!("Reddit resource not found"))
            }
            StatusCode::FORBIDDEN => {
                Err(anyhow!("Access forbidden. The subreddit may be private."))
            }
            status => {
                Err(anyhow!("Reddit API error: {}", status))
            }
        }
    }
}

// Reddit API response types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedditListingResponse {
    pub kind: String,
    pub data: RedditListingData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedditListingData {
    pub after: Option<String>,
    pub before: Option<String>,
    pub children: Vec<RedditThing>,
    pub modhash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedditThing {
    pub kind: String,
    pub data: serde_json::Value, // We'll use Value for flexibility
}

/// Parsed Reddit post data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedditPost {
    pub id: String,
    pub name: String, // Full name (t3_xxx)
    pub title: String,
    pub author: String,
    pub subreddit: String,
    pub url: String,
    pub permalink: String,
    pub selftext: Option<String>,
    pub score: i64,
    pub num_comments: i64,
    pub created_utc: f64,
    pub thumbnail: Option<String>,
    pub is_video: bool,
    pub is_self: bool,
}

impl RedditPost {
    /// Parse a Reddit post from the raw JSON data
    pub fn from_thing(thing: &RedditThing) -> Result<Self> {
        if thing.kind != "t3" {
            return Err(anyhow!("Expected post (t3), got {}", thing.kind));
        }
        
        let data = &thing.data;
        
        Ok(RedditPost {
            id: data.get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing post id"))?
                .to_string(),
            name: data.get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing post name"))?
                .to_string(),
            title: data.get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string(),
            author: data.get("author")
                .and_then(|v| v.as_str())
                .unwrap_or("[deleted]")
                .to_string(),
            subreddit: data.get("subreddit")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing subreddit"))?
                .to_string(),
            url: data.get("url")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            permalink: data.get("permalink")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            selftext: data.get("selftext")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            score: data.get("score")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
            num_comments: data.get("num_comments")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
            created_utc: data.get("created_utc")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0),
            thumbnail: data.get("thumbnail")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty() && *s != "self" && *s != "default")
                .map(|s| s.to_string()),
            is_video: data.get("is_video")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            is_self: data.get("is_self")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
        })
    }
}

/// Parsed Reddit comment data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedditComment {
    pub id: String,
    pub name: String, // Full name (t1_xxx)
    pub author: String,
    pub body: String,
    pub score: i64,
    pub created_utc: f64,
    pub parent_id: String,
    pub permalink: String,
    pub depth: i32,
}

impl RedditComment {
    /// Parse a Reddit comment from the raw JSON data
    pub fn from_thing(thing: &RedditThing) -> Result<Self> {
        if thing.kind != "t1" {
            return Err(anyhow!("Expected comment (t1), got {}", thing.kind));
        }
        
        let data = &thing.data;
        
        Ok(RedditComment {
            id: data.get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing comment id"))?
                .to_string(),
            name: data.get("name")
                .and_then(|v| v.as_str())
                .ok_or_else(|| anyhow!("Missing comment name"))?
                .to_string(),
            author: data.get("author")
                .and_then(|v| v.as_str())
                .unwrap_or("[deleted]")
                .to_string(),
            body: data.get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            score: data.get("score")
                .and_then(|v| v.as_i64())
                .unwrap_or(0),
            created_utc: data.get("created_utc")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0),
            parent_id: data.get("parent_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            permalink: data.get("permalink")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            depth: data.get("depth")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32,
        })
    }
}

/// Trait for Reddit API operations (allows mocking)
#[async_trait::async_trait]
pub trait RedditApi: Send + Sync {
    async fn get_subreddit_hot(&self, subreddit: &str, limit: usize) -> Result<RedditListingResponse>;
    async fn get_subreddit_top(&self, subreddit: &str, limit: usize, time_period: &str) -> Result<RedditListingResponse>;
    async fn get_subreddit_new(&self, subreddit: &str, limit: usize) -> Result<RedditListingResponse>;
    async fn get_post(&self, subreddit: &str, post_id: &str) -> Result<Vec<RedditListingResponse>>;
    async fn get_user_profile(&self, username: &str, content_type: &str, limit: usize) -> Result<RedditListingResponse>;
}

#[async_trait::async_trait]
impl RedditApi for RedditClient {
    async fn get_subreddit_hot(&self, subreddit: &str, limit: usize) -> Result<RedditListingResponse> {
        self.get_subreddit_hot(subreddit, limit).await
    }
    
    async fn get_subreddit_top(&self, subreddit: &str, limit: usize, time_period: &str) -> Result<RedditListingResponse> {
        self.get_subreddit_top(subreddit, limit, time_period).await
    }
    
    async fn get_subreddit_new(&self, subreddit: &str, limit: usize) -> Result<RedditListingResponse> {
        self.get_subreddit_new(subreddit, limit).await
    }
    
    async fn get_post(&self, subreddit: &str, post_id: &str) -> Result<Vec<RedditListingResponse>> {
        self.get_post(subreddit, post_id).await
    }
    
    async fn get_user_profile(&self, username: &str, content_type: &str, limit: usize) -> Result<RedditListingResponse> {
        self.get_user_profile(username, content_type, limit).await
    }
}

/// Mock Reddit client for testing
pub struct MockRedditClient {
    // You can add fields here to control mock behavior if needed
}

impl MockRedditClient {
    pub fn new() -> Self {
        Self {}
    }
    
    /// Create a mock listing response with sample data
    fn create_mock_listing(&self, subreddit: &str, count: usize) -> RedditListingResponse {
        let mut children = Vec::new();
        
        for i in 0..count {
            let post_data = serde_json::json!({
                "id": format!("mock_id_{}", i),
                "name": format!("t3_mock_{}", i),
                "title": format!("Mock Post {} in r/{}", i, subreddit),
                "author": "mock_user",
                "subreddit": subreddit,
                "url": format!("https://reddit.com/r/{}/comments/mock_{}", subreddit, i),
                "permalink": format!("/r/{}/comments/mock_{}/", subreddit, i),
                "selftext": "This is mock post content for testing.",
                "score": 100 + i as i64,
                "num_comments": 10 + i as i64,
                "created_utc": 1700000000.0 + (i as f64 * 3600.0),
                "thumbnail": null,
                "is_video": false,
                "is_self": true,
            });
            
            children.push(RedditThing {
                kind: "t3".to_string(),
                data: post_data,
            });
        }
        
        RedditListingResponse {
            kind: "Listing".to_string(),
            data: RedditListingData {
                after: None,
                before: None,
                children,
                modhash: None,
            },
        }
    }
}

#[async_trait::async_trait]
impl RedditApi for MockRedditClient {
    async fn get_subreddit_hot(&self, subreddit: &str, limit: usize) -> Result<RedditListingResponse> {
        Ok(self.create_mock_listing(subreddit, limit.min(5)))
    }
    
    async fn get_subreddit_top(&self, subreddit: &str, limit: usize, _time_period: &str) -> Result<RedditListingResponse> {
        Ok(self.create_mock_listing(subreddit, limit.min(5)))
    }
    
    async fn get_subreddit_new(&self, subreddit: &str, limit: usize) -> Result<RedditListingResponse> {
        Ok(self.create_mock_listing(subreddit, limit.min(5)))
    }
    
    async fn get_post(&self, subreddit: &str, post_id: &str) -> Result<Vec<RedditListingResponse>> {
        // Return a post and some mock comments
        let post_listing = self.create_mock_listing(subreddit, 1);
        
        let comment_data = serde_json::json!({
            "id": "mock_comment_1",
            "name": "t1_mock_comment_1",
            "author": "commenter",
            "body": "This is a mock comment for testing.",
            "score": 50,
            "created_utc": 1700001000.0,
            "parent_id": format!("t3_{}", post_id),
            "permalink": format!("/r/{}/comments/{}/comment/mock_comment_1", subreddit, post_id),
            "depth": 0,
        });
        
        let comments_listing = RedditListingResponse {
            kind: "Listing".to_string(),
            data: RedditListingData {
                after: None,
                before: None,
                children: vec![RedditThing {
                    kind: "t1".to_string(),
                    data: comment_data,
                }],
                modhash: None,
            },
        };
        
        Ok(vec![post_listing, comments_listing])
    }
    
    async fn get_user_profile(&self, username: &str, _content_type: &str, limit: usize) -> Result<RedditListingResponse> {
        let mut children = Vec::new();
        
        for i in 0..limit.min(3) {
            let post_data = serde_json::json!({
                "id": format!("user_post_{}", i),
                "name": format!("t3_user_post_{}", i),
                "title": format!("Post by {}", username),
                "author": username,
                "subreddit": "test",
                "url": format!("https://reddit.com/user/{}/post_{}", username, i),
                "permalink": format!("/user/{}/post_{}/", username, i),
                "selftext": "User post content",
                "score": 50 + i as i64,
                "num_comments": 5,
                "created_utc": 1700000000.0 + (i as f64 * 7200.0),
                "thumbnail": null,
                "is_video": false,
                "is_self": true,
            });
            
            children.push(RedditThing {
                kind: "t3".to_string(),
                data: post_data,
            });
        }
        
        Ok(RedditListingResponse {
            kind: "Listing".to_string(),
            data: RedditListingData {
                after: None,
                before: None,
                children,
                modhash: None,
            },
        })
    }
}
