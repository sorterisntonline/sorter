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
};

#[derive(Deserialize, Serialize, JsonSchema, Debug, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ClientCommand {
    UpdateQuery { query: String },
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
        
        UIAction::RenderEntityView { pk_namespace, pk } => {
            // TODO: Call entity::get_entity here
            UIResponse::not_yet_implemented(
                "Entity View".to_string(),
                format!("Would show entity {}:{}", pk_namespace, pk),
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

