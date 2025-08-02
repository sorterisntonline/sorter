use axum::{
    extract::{State, WebSocketUpgrade},
    response::Response,
};
use axum::extract::ws::{Message, WebSocket};



use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    app_state::AppState,
    ui::types::{UIResponse, SearchResult, EntityType},
    ui::url_parser::{ParsedUrl, RedditPath, YouTubeContent},
};

#[derive(Deserialize, Serialize, JsonSchema, Debug, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ClientCommand {
    Search { query: String },
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

fn handle_youtube_url(youtube_url: crate::ui::url_parser::YouTubeUrl, original_query: &str) -> UIResponse {
    match youtube_url.content {
        YouTubeContent::Video { id } => {
            let results = vec![
                SearchResult {
                    title: format!("YouTube Video: {}", id),
                    url: format!("https://youtube.com/watch?v={}", id),
                    snippet: Some("Watch this YouTube video".to_string()),
                    score: Some(95.0),
                    entity_type: EntityType::YouTubeVideo,
                },
                SearchResult {
                    title: "Video Comments".to_string(),
                    url: format!("https://youtube.com/watch?v={}", id),
                    snippet: Some("View comments and discussions about this video".to_string()),
                    score: Some(80.0),
                    entity_type: EntityType::Generic,
                },
            ];
            UIResponse::search_results(original_query.to_string(), results)
        }
        YouTubeContent::Channel { id } => {
            let results = vec![
                SearchResult {
                    title: format!("YouTube Channel: {}", id),
                    url: format!("https://youtube.com/channel/{}", id),
                    snippet: Some("Browse this YouTube channel's videos".to_string()),
                    score: Some(95.0),
                    entity_type: EntityType::Generic,
                },
            ];
            UIResponse::search_results(original_query.to_string(), results)
        }
        YouTubeContent::ChannelByName { name } => {
            let results = vec![
                SearchResult {
                    title: format!("YouTube Channel: {}", name),
                    url: format!("https://youtube.com/c/{}", name),
                    snippet: Some("Browse this YouTube channel's content".to_string()),
                    score: Some(95.0),
                    entity_type: EntityType::Generic,
                },
            ];
            UIResponse::search_results(original_query.to_string(), results)
        }
        YouTubeContent::ChannelByHandle { handle } => {
            let results = vec![
                SearchResult {
                    title: format!("YouTube @{}", handle),
                    url: format!("https://youtube.com/@{}", handle),
                    snippet: Some("Browse this YouTube channel's content".to_string()),
                    score: Some(95.0),
                    entity_type: EntityType::Generic,
                },
            ];
            UIResponse::search_results(original_query.to_string(), results)
        }
        YouTubeContent::Playlist { id } => {
            let results = vec![
                SearchResult {
                    title: format!("YouTube Playlist: {}", id),
                    url: format!("https://youtube.com/playlist?list={}", id),
                    snippet: Some("View all videos in this playlist".to_string()),
                    score: Some(95.0),
                    entity_type: EntityType::Generic,
                },
            ];
            UIResponse::search_results(original_query.to_string(), results)
        }
    }
}

fn handle_twitter_url(twitter_url: crate::ui::url_parser::TwitterUrl, original_query: &str) -> UIResponse {
    let mut results = vec![
        SearchResult {
            title: format!("@{} on Twitter", twitter_url.username),
            url: format!("https://twitter.com/{}", twitter_url.username),
            snippet: Some(format!("View {}'s Twitter profile and tweets", twitter_url.username)),
            score: Some(95.0),
            entity_type: EntityType::TwitterPost,
        },
    ];

    if let Some(tweet_id) = twitter_url.tweet_id {
        results.insert(0, SearchResult {
            title: format!("Tweet by @{}", twitter_url.username),
            url: format!("https://twitter.com/{}/status/{}", twitter_url.username, tweet_id),
            snippet: Some("View this specific tweet and its replies".to_string()),
            score: Some(98.0),
            entity_type: EntityType::TwitterPost,
        });
    }

    UIResponse::search_results(original_query.to_string(), results)
}

fn handle_github_url(github_url: crate::ui::url_parser::GitHubUrl, original_query: &str) -> UIResponse {
    let mut results = vec![
        SearchResult {
            title: format!("GitHub: {}", github_url.username),
            url: format!("https://github.com/{}", github_url.username),
            snippet: Some(format!("View {}'s GitHub profile and repositories", github_url.username)),
            score: Some(90.0),
            entity_type: EntityType::Generic,
        },
    ];

    if let Some(repo) = github_url.repo {
        results.insert(0, SearchResult {
            title: format!("{}/{}", github_url.username, repo),
            url: format!("https://github.com/{}/{}", github_url.username, repo),
            snippet: Some("Browse this GitHub repository".to_string()),
            score: Some(95.0),
            entity_type: EntityType::Generic,
        });
    }

    UIResponse::search_results(original_query.to_string(), results)
}

fn handle_generic_url(generic_url: crate::ui::url_parser::GenericUrl, original_query: &str) -> UIResponse {
    let mut base_url = generic_url.domain.clone();
    if let Some(path) = &generic_url.path {
        base_url.push_str(path);
    }

    let results = vec![
        SearchResult {
            title: format!("Website: {}", generic_url.domain),
            url: if let Some(scheme) = generic_url.scheme {
                format!("{}://{}", scheme, base_url)
            } else {
                format!("https://{}", base_url)
            },
            snippet: Some("Visit this website".to_string()),
            score: Some(75.0),
            entity_type: EntityType::WebPage,
        },
    ];

    UIResponse::search_results(original_query.to_string(), results)
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

