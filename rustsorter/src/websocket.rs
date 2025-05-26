use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::app_state::AppState;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

// Core data structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: Uuid,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id: Uuid,
    pub tag_id: Uuid,
    pub text: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attribute {
    pub id: Uuid,
    pub tag_id: Uuid,
    pub label: String,
    pub template: String,
    pub created_by: Uuid,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vote {
    pub id: i64,
    pub tag_id: Uuid,
    pub attribute_id: Uuid,
    pub voter_id: Uuid,
    pub item_a_id: Uuid,
    pub item_b_id: Uuid,
    pub score: i32,
    pub rationale: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Voter {
    pub id: Uuid,
    pub name: String,
    pub is_ai: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedItem {
    pub item_id: Uuid,
    pub rank: usize,
    pub score: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MissingComparison {
    pub item_a_id: Uuid,
    pub item_b_id: Uuid,
    pub item_a_text: String,
    pub item_b_text: String,
}

// Page-specific state structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagsListPageState {
    pub tags: Vec<Tag>,
    pub new_tag_name: String,
    pub show_new_tag_form: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagDetailPageState {
    pub tag: Tag,
    pub items: Vec<Item>,
    pub attributes: Vec<Attribute>,
    pub voters: Vec<Voter>,
    pub votes: Vec<Vote>,
    pub rankings: Vec<RankedItem>,
    pub missing_comparisons: Vec<MissingComparison>,
    pub voters_with_votes: Vec<Uuid>,
    pub selected_attributes: Vec<Uuid>,
    pub selected_voters: Vec<Uuid>,
    pub is_voting_in_progress: bool,
    pub show_new_attribute_form: bool,
    pub new_item_text: String,
    pub new_attribute_label: String,
    pub new_attribute_template: String,
}

// Union of all possible page states
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "page", rename_all = "snake_case")]
pub enum PageState {
    TagsList(TagsListPageState),
    TagDetail(TagDetailPageState),
}

// WebSocket commands from client
#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum WsCommand {
    // Navigation
    NavigateToTagsList,
    NavigateToTagDetail { tag_id: Uuid },
    
    // Tags list page commands
    UpdateNewTagName { name: String },
    ToggleNewTagForm,
    CreateTag { name: String },
    
    // Tag detail page commands (current tag_id is implicit from current page)
    UpdateSelectedVoters { voter_ids: Vec<Uuid> },
    UpdateSelectedAttributes { attribute_ids: Vec<Uuid> },
    UpdateNewItemText { text: String },
    AddItem { text: String },
    DeleteItem { item_id: Uuid },
    ToggleNewAttributeForm,
    UpdateNewAttributeLabel { label: String },
    UpdateNewAttributeTemplate { template: String },
    CreateAttribute { label: String, template: String },
    DeleteAttribute { attribute_id: Uuid },
    SortMissingPairs,
    CreateOrSelectVoter { name: String },
}

// WebSocket events to client
#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum WsEvent {
    Connected,
    Error { message: String },
    PageState { state: PageState },
    VotingProgress { completed: usize, total: usize },
}

// Mock data stores
lazy_static::lazy_static! {
    static ref TAGS: Arc<Mutex<HashMap<Uuid, Tag>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref ITEMS: Arc<Mutex<HashMap<Uuid, Item>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref ATTRIBUTES: Arc<Mutex<HashMap<Uuid, Attribute>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref VOTES: Arc<Mutex<Vec<Vote>>> = Arc::new(Mutex::new(Vec::new()));
    static ref VOTERS: Arc<Mutex<HashMap<Uuid, Voter>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref VOTE_ID_COUNTER: Arc<Mutex<i64>> = Arc::new(Mutex::new(1));
}

// Session state for each WebSocket connection
#[derive(Debug)]
struct SessionState {
    current_tag_id: Option<Uuid>, // For tag detail pages
    tags_list_state: TagsListPageState,
}

impl SessionState {
    fn new() -> Self {
        Self {
            current_tag_id: None,
            tags_list_state: TagsListPageState {
                tags: Vec::new(),
                new_tag_name: String::new(),
                show_new_tag_form: false,
            },
        }
    }
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<WsEvent>();
    
    // Session state for this connection
    let session_state = Arc::new(Mutex::new(SessionState::new()));
    
    // Send connected event
    let _ = tx.send(WsEvent::Connected);
    
    // Spawn task to handle outgoing messages
    let mut send_task = tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let Ok(msg) = serde_json::to_string(&event) {
                if sender.send(Message::Text(msg)).await.is_err() {
                    break;
                }
            }
        }
    });
    
    // Handle incoming messages
    while let Some(msg) = receiver.next().await {
        if let Ok(Message::Text(text)) = msg {
            match serde_json::from_str::<WsCommand>(&text) {
                Ok(cmd) => {
                    handle_command(cmd, tx.clone(), &state, session_state.clone()).await;
                }
                Err(e) => {
                    let _ = tx.send(WsEvent::Error { 
                        message: format!("Invalid command: {}", e) 
                    });
                }
            }
        }
    }
    
    send_task.abort();
}

async fn handle_command(
    cmd: WsCommand,
    tx: mpsc::UnboundedSender<WsEvent>,
    _state: &AppState,
    session_state: Arc<Mutex<SessionState>>,
) {
    log::info!("handle_command: {:?}", cmd);
    match cmd {
        WsCommand::NavigateToTagsList => {
            let tags = {
                let tags = TAGS.lock().unwrap();
                tags.values().cloned().collect()
            };
            
            let mut session = session_state.lock().unwrap();
            session.tags_list_state.tags = tags;
            session.current_tag_id = None;
            
            let page_state = PageState::TagsList(session.tags_list_state.clone());
            let _ = tx.send(WsEvent::PageState { state: page_state });
        }
        
        WsCommand::NavigateToTagDetail { tag_id } => {
            let page_state = build_tag_detail_page_state(tag_id, &session_state);
            let _ = tx.send(WsEvent::PageState { state: page_state });
        }
        
        WsCommand::UpdateNewTagName { name } => {
            let mut session = session_state.lock().unwrap();
            session.tags_list_state.new_tag_name = name;
            
            let page_state = PageState::TagsList(session.tags_list_state.clone());
            let _ = tx.send(WsEvent::PageState { state: page_state });
        }
        
        WsCommand::ToggleNewTagForm => {
            let mut session = session_state.lock().unwrap();
            session.tags_list_state.show_new_tag_form = !session.tags_list_state.show_new_tag_form;
            if session.tags_list_state.show_new_tag_form {
                session.tags_list_state.new_tag_name = String::new();
            }
            
            let page_state = PageState::TagsList(session.tags_list_state.clone());
            let _ = tx.send(WsEvent::PageState { state: page_state });
        }
        
        WsCommand::CreateTag { name } => {
            if !name.trim().is_empty() {
                let tag_id = Uuid::new_v4();
                let tag = Tag {
                    id: tag_id,
                    name: name.trim().to_string(),
                    created_at: chrono::Utc::now().to_rfc3339(),
                };
                
                TAGS.lock().unwrap().insert(tag_id, tag.clone());
                
                // Create default attribute
                let attr_id = Uuid::new_v4();
                let attribute = Attribute {
                    id: attr_id,
                    tag_id,
                    label: "Pure Preference".to_string(),
                    template: "Which do you prefer?\n\nA: {{A}}\nB: {{B}}\n\nRespond with a score from -50 to 50.".to_string(),
                    created_by: Uuid::new_v4(),
                    created_at: chrono::Utc::now().to_rfc3339(),
                };
                ATTRIBUTES.lock().unwrap().insert(attr_id, attribute);
                
                // Navigate to the new tag detail page
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        // Tag detail page commands
        WsCommand::UpdateSelectedVoters { voter_ids } => {
            if let Some(tag_id) = session_state.lock().unwrap().current_tag_id {
                update_tag_detail_state(tag_id, &session_state, |state| {
                    state.selected_voters = voter_ids;
                });
                
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::UpdateSelectedAttributes { attribute_ids } => {
            if let Some(tag_id) = session_state.lock().unwrap().current_tag_id {
                update_tag_detail_state(tag_id, &session_state, |state| {
                    state.selected_attributes = attribute_ids;
                });
                
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::UpdateNewItemText { text } => {
            if let Some(tag_id) = session_state.lock().unwrap().current_tag_id {
                update_tag_detail_state(tag_id, &session_state, |state| {
                    state.new_item_text = text;
                });
                
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::AddItem { text } => {
            if let Some(tag_id) = session_state.lock().unwrap().current_tag_id {
                if !text.trim().is_empty() {
                    let item_id = Uuid::new_v4();
                    let item = Item {
                        id: item_id,
                        tag_id,
                        text: text.trim().to_string(),
                        created_at: chrono::Utc::now().to_rfc3339(),
                    };
                    
                    ITEMS.lock().unwrap().insert(item_id, item);
                }
                
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::CreateAttribute { label, template } => {
            if let Some(tag_id) = session_state.lock().unwrap().current_tag_id {
                if !label.trim().is_empty() && !template.trim().is_empty() {
                    let attr_id = Uuid::new_v4();
                    let attribute = Attribute {
                        id: attr_id,
                        tag_id,
                        label: label.trim().to_string(),
                        template: template.trim().to_string(),
                        created_by: Uuid::new_v4(), // TODO: use actual user ID
                        created_at: chrono::Utc::now().to_rfc3339(),
                    };
                    
                    ATTRIBUTES.lock().unwrap().insert(attr_id, attribute);
                }
                
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }

        // ... other commands would be implemented similarly
        _ => {
            let _ = tx.send(WsEvent::Error { 
                message: "Command not implemented yet".to_string() 
            });
        }
    }
}

fn build_tag_detail_page_state(
    tag_id: Uuid,
    session_state: &Arc<Mutex<SessionState>>,
) -> PageState {
    // Update session to track current tag
    session_state.lock().unwrap().current_tag_id = Some(tag_id);
    
    // Get tag
    let tag = {
        let tags = TAGS.lock().unwrap();
        tags.get(&tag_id).cloned().unwrap_or_else(|| Tag {
            id: tag_id,
            name: "Unknown".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        })
    };
    
    // Get items
    let items: Vec<Item> = {
        let items = ITEMS.lock().unwrap();
        items.values()
            .filter(|item| item.tag_id == tag_id)
            .cloned()
            .collect()
    };
    
    // Get attributes
    let attributes: Vec<Attribute> = {
        let attributes = ATTRIBUTES.lock().unwrap();
        attributes.values()
            .filter(|attr| attr.tag_id == tag_id)
            .cloned()
            .collect()
    };
    
    // Get voters
    let voters: Vec<Voter> = {
        let voters = VOTERS.lock().unwrap();
        voters.values().cloned().collect()
    };
    
    // Get votes
    let votes: Vec<Vote> = {
        let votes = VOTES.lock().unwrap();
        votes.iter()
            .filter(|vote| vote.tag_id == tag_id)
            .cloned()
            .collect()
    };
    
    // Calculate derived state
    let voters_with_votes = calculate_voters_with_votes(&votes);
    let rankings = calculate_rankings(&items, &votes);
    let missing_comparisons = Vec::new(); // TODO: implement
    
    let state = TagDetailPageState {
        tag,
        items,
        attributes,
        voters,
        votes,
        rankings,
        missing_comparisons,
        voters_with_votes,
        selected_attributes: Vec::new(),
        selected_voters: Vec::new(),
        is_voting_in_progress: false,
        show_new_attribute_form: false,
        new_item_text: String::new(),
        new_attribute_label: String::new(),
        new_attribute_template: String::new(),
    };
    
    PageState::TagDetail(state)
}

fn update_tag_detail_state<F>(
    tag_id: Uuid,
    session_state: &Arc<Mutex<SessionState>>,
    update_fn: F,
) where
    F: FnOnce(&mut TagDetailPageState),
{
    // This is a simplified version - in a real implementation,
    // you'd store the tag detail state in the session
    // For now, we'll just rebuild it each time
}

fn get_tag_detail_state(
    session_state: &Arc<Mutex<SessionState>>,
    tag_id: Uuid,
) -> Option<TagDetailPageState> {
    // Simplified - would normally get from session state
    None
}

fn calculate_voters_with_votes(votes: &[Vote]) -> Vec<Uuid> {
    let mut voter_ids: HashSet<Uuid> = HashSet::new();
    for vote in votes {
        voter_ids.insert(vote.voter_id);
    }
    voter_ids.into_iter().collect()
}

fn calculate_rankings(items: &[Item], votes: &[Vote]) -> Vec<RankedItem> {
    // Simplified ranking calculation
    items.iter().enumerate().map(|(i, item)| RankedItem {
        item_id: item.id,
        rank: i + 1,
        score: 50.0,
        text: item.text.clone(),
    }).collect()
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/ws", axum::routing::get(ws_handler))
} 