use axum::{
    extract::{State, WebSocketUpgrade},
    response::Response,
};
use axum::extract::ws::{Message, WebSocket};
use std::pin::Pin;
use std::future::Future;



use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{
    app_state::AppState,
    ui::types::UIResponse,
    ui::action::UIAction,
    ui::composable_parser,
    entity,
    entity_relationships,
    integrations::reddit::{RedditPost, RedditComment},
};

#[derive(Deserialize, Serialize, JsonSchema, Debug, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ClientCommand {
    UpdateQuery { query: String },
    Vote { item_a_id: String, item_b_id: String, preference: VotePreference },
    NavigateToEntity { entity_id: String },
    FetchVotingPairs { context: String },
    ExecuteRedditImport(RedditImport),
    Ping,
}

#[derive(Deserialize, Serialize, JsonSchema, Debug, Clone)]
#[serde(tag = "source", rename_all = "snake_case")]
pub enum RedditImport {
    // Import hot posts for a subreddit
    SubredditHot { subreddit: String, limit: Option<u16> },
    // Import a specific thread, parser already has these parts
    ThreadRef { subreddit: String, post_id: String, slug: Option<String> },
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
        ClientCommand::UpdateQuery { query } => {
            handle_update_query_command(query, app_state).await
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
        ClientCommand::ExecuteRedditImport(import) => {
            handle_execute_reddit_import_command(import, app_state).await
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

async fn handle_update_query_command(query: String, app_state: &AppState) -> UIResponse {
    // Phase 1: Pure, synchronous parsing - the parser determines intent
    let action = composable_parser::parse_reddit_url(&query);
    
    // Phase 2: Stateful, async execution - dispatch the action
    dispatch_ui_action(action, app_state).await
}

/// Dispatch a UIAction to produce a UIResponse
/// This is where stateful/async operations happen (database queries, API calls, etc.)
fn dispatch_ui_action(action: UIAction, _app_state: &AppState) -> Pin<Box<dyn Future<Output = UIResponse> + Send + '_>> {
    Box::pin(async move {
    match action {
        // --- Static actions (no database needed) ---
        UIAction::ShowStaticGuide { query, title, description, options } => {
            UIResponse::guide(query, title, description, options)
        }
        
        UIAction::ShowStaticSelection { query, title, description, items } => {
            UIResponse::selection(query, title, description, items)
        }
        
        UIAction::ShowSuggestions(suggestions_data) => {
            UIResponse::Suggestions(suggestions_data)
        }
        
        UIAction::ShowScrollingSuggestions { query, suggestions, animation_interval_ms, loop_through } => {
            UIResponse::scrolling_suggestions(query, suggestions, animation_interval_ms, loop_through)
        }
        
        UIAction::ShowError(error_data) => {
            UIResponse::ErrorPage(error_data)
        }
        
        UIAction::ShowNotYetImplemented(not_impl_data) => {
            UIResponse::NotYetImplemented(not_impl_data)
        }
        
        UIAction::ShowHomePage { query } => {
            UIResponse::home_page(query)
        }
        
        UIAction::ShowMultiple { actions } => {
            // Recursively dispatch each action
            let mut responses = Vec::new();
            for sub_action in actions {
                responses.push(dispatch_ui_action(sub_action, _app_state).await);
            }
            UIResponse::multiple(responses)
        }
        
        // --- Dynamic actions (database/state required) ---
        UIAction::RenderSubredditView { subreddit, sort } => {
            // TODO: Implement actual Reddit API integration
            // For now, return a placeholder
            let sort_type = sort.unwrap_or_else(|| "hot".to_string());
            UIResponse::not_yet_implemented(
                format!("Subreddit View: r/{}", subreddit),
                format!("Would show {} posts from r/{}", sort_type, subreddit),
                Some("https://github.com/yourusername/sorter/issues".to_string()),
            )
        }
        
        UIAction::RenderSubredditComments { subreddit } => {
            // TODO: Implement comment loading
            UIResponse::not_yet_implemented(
                format!("Subreddit Comments: r/{}", subreddit),
                format!("Would show all comments from r/{}", subreddit),
                None,
            )
        }
        
        UIAction::RenderUserProfile { username } => {
            // TODO: Implement user profile loading
            UIResponse::not_yet_implemented(
                format!("User Profile: u/{}", username),
                format!("Would show posts and comments from u/{}", username),
                None,
            )
        }
        
        UIAction::RenderPost { subreddit, post_id } => {
            // TODO: Implement post loading
            UIResponse::not_yet_implemented(
                format!("Post View"),
                format!("Would show post {} from r/{}", post_id, subreddit),
                None,
            )
        }
        
        UIAction::ImportRedditContent { url, entity_type, context: _ } => {
            // TODO: Implement Reddit content import
            UIResponse::not_yet_implemented(
                format!("Import {}", entity_type),
                format!("Would import {} from: {}", entity_type, url),
                None,
            )
        }
        
        UIAction::RenderEntityView { ns, pk } => {
            // TODO: Call entity::get_entity here
            UIResponse::not_yet_implemented(
                "Entity View".to_string(),
                format!("Would show entity {}:{}", ns, pk),
                None,
            )
        }
        
        UIAction::SuggestSubredditsFromDb { partial } => {
            // TODO: Query database for matching subreddits
            UIResponse::not_yet_implemented(
                "Subreddit Suggestions".to_string(),
                format!("Would suggest subreddits matching '{}'", partial),
                None,
            )
        }
        
        UIAction::SearchEntities { query, entity_type } => {
            // TODO: Search database for entities
            let type_str = entity_type.unwrap_or_else(|| "all".to_string());
            UIResponse::not_yet_implemented(
                "Entity Search".to_string(),
                format!("Would search for {} entities matching '{}'", type_str, query),
                None,
            )
        }
    }
    })
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

async fn handle_execute_reddit_import_command(
    import: RedditImport,
    app_state: &AppState,
) -> UIResponse {
    log::info!("Executing Reddit import: {:?}", import);

    match reddit_import_logic(import, app_state).await {
        Ok(response) => response,
        Err(e) => {
            log::error!("Import failed: {}", e);
            UIResponse::error(
                "ImportFailed".to_string(),
                e.to_string(),
            )
        }
    }
}

/// Import Reddit content based on source and context
async fn reddit_import_logic(
    import: RedditImport,
    app_state: &AppState,
) -> Result<UIResponse, Box<dyn std::error::Error + Send + Sync>> {
    match import {
        RedditImport::SubredditHot { subreddit, limit } => {
            let lim = limit.unwrap_or(25) as usize;

            // Fetch posts from Reddit
            let listing = app_state
                .reddit_client
                .get_subreddit_hot(&subreddit, lim)
                .await?;

            let posts_owned = listing.into_posts();
            let post_refs: Vec<&RedditPost> = posts_owned.iter().collect();
            let imported_count = import_posts_to_database(&post_refs, &subreddit, app_state).await?;

            Ok(UIResponse::not_yet_implemented(
                format!("Imported r/{}", subreddit),
                format!("Successfully imported {} posts from r/{}/hot", imported_count, subreddit),
                None,
            ))
        }

        RedditImport::ThreadRef { subreddit, post_id, .. } => {
            // Fetch post and comments
            let listings = app_state
                .reddit_client
                .get_post(&subreddit, &post_id)
                .await?;

            let mut imported_posts = 0;
            let mut imported_comments = 0;

            for listing in listings {
                let posts = listing.get_posts();
                let comments = listing.get_comments();

                if !posts.is_empty() {
                    imported_posts += import_posts_to_database(&posts, &subreddit, app_state).await?;
                }

                if !comments.is_empty() {
                    imported_comments += import_comments_to_database(&comments, &subreddit, app_state).await?;
                }
            }

            Ok(UIResponse::not_yet_implemented(
                "Imported Reddit Thread".to_string(),
                format!(
                    "Successfully imported {} posts and {} comments from r/{}/comments/{}",
                    imported_posts, imported_comments, subreddit, post_id
                ),
                None,
            ))
        }
    }
}

/// Import Reddit posts to the database
async fn import_posts_to_database(
    posts: &[&RedditPost],
    subreddit: &str,
    app_state: &AppState,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    use chrono::Utc;
    use serde_json::to_value;
    
    let mut imported_count = 0;
    
    // Resolve admin user from DB (seeded in migrations)
    let admin_user_id: uuid::Uuid = sqlx::query_scalar!("SELECT id FROM users WHERE auth0_sub = $1", "admin")
        .fetch_one(&app_state.db)
        .await?;
    
    // Ensure the subreddit entity exists (minimal metadata)
    entity::create_entity_ignore_conflict(
        &app_state.db,
        "reddit.subreddit",
        subreddit,
        None,
        None,
        None,
        admin_user_id,
    )
    .await?;
    
    for post in posts {
        let post = *post;

        // Serialize the full RedditPost as metadata
        let metadata_val = to_value(post)?;

        // Create post entity
        match entity::create_entity_ignore_conflict(
            &app_state.db,
            "reddit.post",
            &post.id,
            Some(post.title.as_str()),
            post.thumbnail.as_deref(),
            Some(&metadata_val),
            admin_user_id,
        )
        .await
        {
            Ok(_) => {
                // Create relationship: subreddit -> post
                let payload = entity_relationships::CreateRelationshipPayload {
                    parent_ns: "reddit.subreddit".to_string(),
                    parent_pk: subreddit.to_string(),
                    child_ns: "reddit.post".to_string(),
                    child_pk: post.id.clone(),
                };
                entity_relationships::create_relationship_ignore_conflict(
                    &app_state.db,
                    payload,
                    admin_user_id,
                )
                .await?;
                
                imported_count += 1;
                log::debug!("Imported post: {}", post.id);
            }
            Err(e) => {
                log::warn!("Failed to import post {}: {}", post.id, e);
            }
        }
    }
    
    log::info!("Imported {} posts to r/{}", imported_count, subreddit);
    Ok(imported_count)
}

/// Import Reddit comments to the database
async fn import_comments_to_database(
    comments: &[&RedditComment],
    subreddit: &str,
    app_state: &AppState,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    use chrono::Utc;
    use serde_json::to_value;
    
    let mut imported_count = 0;
    
    let admin_user_id: uuid::Uuid = sqlx::query_scalar!("SELECT id FROM users WHERE auth0_sub = $1", "admin")
        .fetch_one(&app_state.db)
        .await?;
    
    for comment in comments {
        let comment = *comment;

        // Serialize the full RedditComment as metadata
        let metadata_val = to_value(comment)?;

        // Create comment entity (no title/profile picture)
        match entity::create_entity_ignore_conflict(
            &app_state.db,
            "reddit.comment",
            &comment.id,
            None,
            None,
            Some(&metadata_val),
            admin_user_id,
        )
        .await
        {
            Ok(_) => {
                // Create relationship based on parent_id
                if let Some(parent_id) = comment.parent_id.strip_prefix("t3_") {
                    // Parent is a post
                    let payload = entity_relationships::CreateRelationshipPayload {
                        parent_ns: "reddit.post".to_string(),
                        parent_pk: parent_id.to_string(),
                        child_ns: "reddit.comment".to_string(),
                        child_pk: comment.id.clone(),
                    };
                    entity_relationships::create_relationship_ignore_conflict(
                        &app_state.db,
                        payload,
                        admin_user_id,
                    )
                    .await?;
                } else if let Some(parent_id) = comment.parent_id.strip_prefix("t1_") {
                    // Parent is another comment
                    let payload = entity_relationships::CreateRelationshipPayload {
                        parent_ns: "reddit.comment".to_string(),
                        parent_pk: parent_id.to_string(),
                        child_ns: "reddit.comment".to_string(),
                        child_pk: comment.id.clone(),
                    };
                    entity_relationships::create_relationship_ignore_conflict(
                        &app_state.db,
                        payload,
                        admin_user_id,
                    )
                    .await?;
                }
                
                imported_count += 1;
                log::debug!("Imported comment: {}", comment.id);
            }
            Err(e) => {
                log::warn!("Failed to import comment {}: {}", comment.id, e);
            }
        }
    }
    
    log::info!("Imported {} comments", imported_count);
    Ok(imported_count)
}

