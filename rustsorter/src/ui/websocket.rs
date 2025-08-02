use axum::{
    extract::{State, WebSocketUpgrade},
    response::Response,
};
use axum::extract::ws::{Message, WebSocket};



use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use fuzzy_matcher::FuzzyMatcher;
use fuzzy_matcher::skim::SkimMatcherV2;

use crate::{
    app_state::AppState,
    ui::types::{UIResponse, SearchResult, EntityType, Suggestion},
    ui::url_parser::{ParsedUrl, RedditPath, YouTubeContent},
};

#[derive(Deserialize, Serialize, JsonSchema, Debug, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ClientCommand {
    Search { query: String },
    Autocomplete { query: String },
    Vote { item_a_id: String, item_b_id: String, preference: VotePreference },
    NavigateToEntity { entity_id: String },
    FetchVotingPairs { context: String },
    Ping,
}

#[derive(Deserialize, Serialize, JsonSchema, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum VotePreference {
    PreferA,
    PreferB,
    Neutral,
}

#[derive(Serialize, JsonSchema, Debug, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ServerMessage {
    UIUpdate(UIResponse),
    Acknowledgment { command_id: Option<String> },
    Error { message: String },
    Pong,
}

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(app_state): State<AppState>,
) -> Response {
    ws.on_upgrade(|socket| handle_websocket(socket, app_state))
}

async fn handle_websocket(mut socket: WebSocket, app_state: AppState) {
    log::info!("WebSocket connection established");

    // Send initial homepage state
    let initial_response = UIResponse::home_page(None);
    let initial_message = ServerMessage::UIUpdate(initial_response);
    
    if let Ok(msg_json) = serde_json::to_string(&initial_message) {
        if socket.send(Message::Text(msg_json.into())).await.is_err() {
            return;
        }
    }

    // Handle incoming messages
    while let Some(msg_result) = socket.recv().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                if let Err(e) = handle_client_message(&mut socket, &text, &app_state).await {
                    log::error!("Error handling WebSocket message: {}", e);
                    let error_msg = ServerMessage::Error {
                        message: e.to_string(),
                    };
                    if let Ok(error_json) = serde_json::to_string(&error_msg) {
                        let _ = socket.send(Message::Text(error_json.into())).await;
                    }
                }
            }
            Ok(Message::Close(_)) => {
                log::info!("WebSocket connection closed");
                break;
            }
            Ok(Message::Ping(data)) => {
                let _ = socket.send(Message::Pong(data)).await;
            }
            Ok(Message::Pong(_)) => {
                // Handle pong if needed
            }
            Err(e) => {
                log::error!("WebSocket error: {}", e);
                break;
            }
            _ => {
                // Handle other message types if needed
            }
        }
    }

    log::info!("WebSocket connection ended");
}

async fn handle_client_message(
    socket: &mut WebSocket,
    text: &str,
    app_state: &AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let command: ClientCommand = serde_json::from_str(text)?;
    
    log::info!("Received WebSocket command: {:?}", command);

    let response = match command {
        ClientCommand::Search { query } => {
            handle_search_command(query).await
        }
        ClientCommand::Autocomplete { query } => {
            handle_autocomplete_command(query).await
        }
        ClientCommand::Vote { item_a_id, item_b_id, preference } => {
            handle_vote_command(item_a_id, item_b_id, preference, app_state).await
        }
        ClientCommand::NavigateToEntity { entity_id } => {
            handle_navigate_command(entity_id, app_state).await
        }
        ClientCommand::FetchVotingPairs { context } => {
            handle_fetch_pairs_command(context, app_state).await
        }
        ClientCommand::Ping => {
            // Send pong response
            let pong_msg = ServerMessage::Pong;
            let pong_json = serde_json::to_string(&pong_msg)?;
            socket.send(Message::Text(pong_json.into())).await?;
            return Ok(());
        }
    };

    let server_message = ServerMessage::UIUpdate(response);
    let response_json = serde_json::to_string(&server_message)?;
    socket.send(Message::Text(response_json.into())).await?;

    Ok(())
}

async fn handle_search_command(query: String) -> UIResponse {
    let query = query.trim();
    
    if query.is_empty() {
        return UIResponse::home_page(None);
    }

    // Parse the URL using our pest parser
    match ParsedUrl::parse(query) {
        Ok(parsed_url) => {
            log::info!("Parsed URL: {:?}", parsed_url);
            
            match parsed_url {
                ParsedUrl::Reddit(reddit_url) => {
                    handle_reddit_url(reddit_url, query)
                }
                ParsedUrl::YouTube(youtube_url) => {
                    handle_youtube_url(youtube_url, query)
                }
                ParsedUrl::Twitter(twitter_url) => {
                    handle_twitter_url(twitter_url, query)
                }
                ParsedUrl::GitHub(github_url) => {
                    handle_github_url(github_url, query)
                }
                ParsedUrl::Generic(generic_url) => {
                    handle_generic_url(generic_url, query)
                }
            }
        }
        Err(parse_error) => {
            log::warn!("Failed to parse URL '{}': {}", query, parse_error);
            
            // Fall back to treating it as a generic search term
            let results = vec![
                SearchResult {
                    title: format!("Search for: {}", query),
                    url: format!("https://www.google.com/search?q={}", urlencoding::encode(query)),
                    snippet: Some("This doesn't appear to be a valid URL, but you can search for it".to_string()),
                    score: Some(50.0),
                    entity_type: EntityType::Generic,
                },
            ];
            UIResponse::search_results(query.to_string(), results)
        }
    }
}

fn handle_reddit_url(reddit_url: crate::ui::url_parser::RedditUrl, original_query: &str) -> UIResponse {
    match reddit_url.path {
        RedditPath::Subreddit { name } => {
            let results = vec![
                SearchResult {
                    title: format!("r/{} - Subreddit", name),
                    url: format!("https://reddit.com/r/{}", name),
                    snippet: Some(format!("Browse posts from the {} subreddit", name)),
                    score: Some(95.5),
                    entity_type: EntityType::RedditSubreddit,
                },
                SearchResult {
                    title: format!("Top posts from r/{}", name),
                    url: format!("https://reddit.com/r/{}/top", name),
                    snippet: Some("View the highest-rated posts of all time".to_string()),
                    score: Some(90.0),
                    entity_type: EntityType::RedditPost,
                },
                SearchResult {
                    title: format!("New posts from r/{}", name),
                    url: format!("https://reddit.com/r/{}/new", name),
                    snippet: Some("See the latest posts in this subreddit".to_string()),
                    score: Some(85.0),
                    entity_type: EntityType::RedditPost,
                },
            ];
            UIResponse::search_results(original_query.to_string(), results)
        }
        RedditPath::SubredditPost { subreddit, post_id, slug, comment_id } => {
            let mut results = vec![
                SearchResult {
                    title: format!("Reddit Post in r/{}", subreddit),
                    url: if let Some(s) = &slug {
                        format!("https://reddit.com/r/{}/comments/{}/{}", subreddit, post_id, s)
                    } else {
                        format!("https://reddit.com/r/{}/comments/{}", subreddit, post_id)
                    },
                    snippet: Some("View this specific Reddit post and its comments".to_string()),
                    score: Some(95.0),
                    entity_type: EntityType::RedditPost,
                },
                SearchResult {
                    title: format!("More posts from r/{}", subreddit),
                    url: format!("https://reddit.com/r/{}", subreddit),
                    snippet: Some(format!("Browse other posts in the {} subreddit", subreddit)),
                    score: Some(80.0),
                    entity_type: EntityType::RedditSubreddit,
                },
            ];

            if comment_id.is_some() {
                results.insert(0, SearchResult {
                    title: "Specific Comment Thread".to_string(),
                    url: format!("https://reddit.com/r/{}/comments/{}/{}/{}", 
                               subreddit, post_id, slug.unwrap_or_default(), comment_id.unwrap()),
                    snippet: Some("View this specific comment and its replies".to_string()),
                    score: Some(98.0),
                    entity_type: EntityType::RedditComment,
                });
            }

            UIResponse::search_results(original_query.to_string(), results)
        }
        RedditPath::User { username } => {
            let results = vec![
                SearchResult {
                    title: format!("u/{} - Reddit User", username),
                    url: format!("https://reddit.com/u/{}", username),
                    snippet: Some(format!("View {}'s profile and post history", username)),
                    score: Some(95.0),
                    entity_type: EntityType::RedditUser,
                },
                SearchResult {
                    title: format!("{}'s Posts", username),
                    url: format!("https://reddit.com/u/{}/submitted", username),
                    snippet: Some("See all posts submitted by this user".to_string()),
                    score: Some(85.0),
                    entity_type: EntityType::RedditPost,
                },
                SearchResult {
                    title: format!("{}'s Comments", username),
                    url: format!("https://reddit.com/u/{}/comments", username),
                    snippet: Some("View this user's comment history".to_string()),
                    score: Some(80.0),
                    entity_type: EntityType::RedditComment,
                },
            ];
            UIResponse::search_results(original_query.to_string(), results)
        }
    }
}

fn handle_youtube_url(_youtube_url: crate::ui::url_parser::YouTubeUrl, _original_query: &str) -> UIResponse {
    UIResponse::not_yet_implemented(
        "YouTube Integration".to_string(),
        "Full support for YouTube URLs is coming soon. You'll be able to rank videos, comments, and channels.".to_string(),
        Some("https://github.com/sorter/sorter/issues/124".to_string()),
    )
}

fn handle_twitter_url(_twitter_url: crate::ui::url_parser::TwitterUrl, _original_query: &str) -> UIResponse {
    UIResponse::not_yet_implemented(
        "Twitter/X Integration".to_string(),
        "Full support for Twitter/X URLs is in the works. You'll be able to rank tweets and user profiles.".to_string(),
        Some("https://github.com/sorter/sorter/issues/125".to_string()),
    )
}

fn handle_github_url(_github_url: crate::ui::url_parser::GitHubUrl, _original_query: &str) -> UIResponse {
    UIResponse::not_yet_implemented(
        "GitHub Integration".to_string(),
        "Full support for GitHub URLs is planned. You'll be able to rank repositories, issues, and pull requests.".to_string(),
        Some("https://github.com/sorter/sorter/issues/126".to_string()),
    )
}

fn handle_generic_url(_generic_url: crate::ui::url_parser::GenericUrl, _original_query: &str) -> UIResponse {
    UIResponse::not_yet_implemented(
        "Generic URL Support".to_string(),
        "Full support for arbitrary URLs is not yet available. We're working on a system to scrape and rank any web page.".to_string(),
        Some("https://github.com/sorter/sorter/issues/127".to_string()),
    )
}

async fn handle_autocomplete_command(query: String) -> UIResponse {
    let query = query.trim();
    
    if query.is_empty() {
        return UIResponse::suggestions(query.to_string(), None);
    }

    // URL patterns with their completions and descriptions
    const URL_PATTERNS: &[(&str, &str, &str)] = &[
        // Reddit patterns
        ("r/", "reddit.com/r/", "Browse a subreddit"),
        ("u/", "reddit.com/u/", "View a Reddit user profile"),
        ("reddit", "reddit.com/r/", "Browse Reddit"),
        ("reddit.com", "reddit.com/r/", "Browse Reddit"),
        
        // YouTube patterns  
        ("y/", "youtube.com/", "Search YouTube"),
        ("yt", "youtube.com/", "Search YouTube"),
        ("youtu", "youtube.com/", "Search YouTube"),
        ("youtube", "youtube.com/", "Search YouTube"),
        
        // GitHub patterns
        ("gh/", "github.com/", "Browse GitHub"),
        ("github", "github.com/", "Browse GitHub"),
        ("git", "github.com/", "Browse GitHub"),
        
        // Twitter patterns
        ("tw/", "twitter.com/", "Browse Twitter/X"),
        ("x/", "x.com/", "Browse Twitter/X"),
        ("twitter", "twitter.com/", "Browse Twitter/X"),
        
        // Common full domains
        ("reddit.com/r/programming", "reddit.com/r/programming", "Programming subreddit"),
        ("reddit.com/r/askreddit", "reddit.com/r/askreddit", "AskReddit subreddit"),
        ("youtube.com/watch", "youtube.com/watch?v=", "Watch a YouTube video"),
        ("github.com/microsoft/vscode", "github.com/microsoft/vscode", "Visual Studio Code repository"),
    ];

    let matcher = SkimMatcherV2::default();
    let mut suggestions = Vec::new();

    // Exact prefix matches (highest priority)
    for (pattern, completion, description) in URL_PATTERNS {
        if pattern.starts_with(query.to_lowercase().as_str()) {
            suggestions.push(Suggestion {
                text: completion.to_string(),
                completion: completion.to_string(),
                description: Some(description.to_string()),
                score: 100.0 - (pattern.len() as f64 - query.len() as f64), // Shorter remaining = higher score
            });
        }
    }

    // Fuzzy matches (lower priority)
    for (pattern, completion, description) in URL_PATTERNS {
        if let Some(score) = matcher.fuzzy_match(pattern, query) {
            // Avoid duplicates from exact matches
            if !suggestions.iter().any(|s| s.completion == *completion) {
                suggestions.push(Suggestion {
                    text: completion.to_string(),
                    completion: completion.to_string(),
                    description: Some(description.to_string()),
                    score: score as f64,
                });
            }
        }
    }

    // Sort by score (descending)
    suggestions.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    // Limit to top 5 suggestions
    suggestions.truncate(5);

    // Return only the best suggestion, if any
    UIResponse::suggestions(query.to_string(), suggestions.into_iter().next())
}

async fn handle_vote_command(
    _item_a_id: String,
    _item_b_id: String,
    _preference: VotePreference,
    _app_state: &AppState,
) -> UIResponse {
    // TODO: Implement actual voting logic
    // For now, return a mock response
    UIResponse::error(
        "NotImplemented".to_string(),
        "Voting functionality not yet implemented".to_string(),
    )
}

async fn handle_navigate_command(_entity_id: String, _app_state: &AppState) -> UIResponse {
    // TODO: Implement entity navigation
    UIResponse::error(
        "NotImplemented".to_string(),
        "Entity navigation not yet implemented".to_string(),
    )
}

async fn handle_fetch_pairs_command(_context: String, _app_state: &AppState) -> UIResponse {
    // TODO: Implement fetching voting pairs
    UIResponse::error(
        "NotImplemented".to_string(),
        "Voting pairs fetching not yet implemented".to_string(),
    )
}

