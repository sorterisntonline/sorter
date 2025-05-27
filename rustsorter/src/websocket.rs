use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::app_state::AppState;
use crate::pagerank::{EntityIdentifier, RelevantVote, build_rank_graph, calculate_tommy_rank};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use reqwest;
use regex::Regex;
use rand::seq::SliceRandom;

// OpenRouter API structures
#[derive(Debug, Serialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<OpenRouterMessage>,
    max_tokens: Option<u32>,
    temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
struct OpenRouterMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    choices: Vec<OpenRouterChoice>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterChoice {
    message: OpenRouterResponseMessage,
}

#[derive(Debug, Deserialize)]
struct OpenRouterResponseMessage {
    content: String,
}

// Voting session state
#[derive(Debug, Clone)]
struct VotingSession {
    tag_id: Uuid,
    voter_ids: Vec<Uuid>,
    attribute_ids: Vec<Uuid>,
    comparisons: Vec<MissingComparison>,
    current_index: usize,
    is_paused: bool,
    total_comparisons: usize,
}

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagDetailPageState {
    pub tag: Tag,
    pub sorted_items: Vec<RankedItem>, // Items with votes and rankings
    pub unsorted_items: Vec<Item>, // Items without votes
    pub attributes: Vec<Attribute>,
    pub voters: Vec<Voter>,
    pub votes: Vec<Vote>,
    pub rankings: Vec<RankedItem>, // Keep for backward compatibility
    pub unvoted_item_count: usize, // Count of items without votes
    pub voters_with_votes: Vec<Uuid>,
    pub selected_attributes: Vec<Uuid>,
    pub selected_voters: Vec<Uuid>,
    pub is_voting_in_progress: bool,

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
    CreateTag { name: String },
    
    // Tag detail page commands (current tag_id is implicit from current page)
    UpdateSelectedVoters { voter_ids: Vec<Uuid> },
    UpdateSelectedAttributes { attribute_ids: Vec<Uuid> },
    AddItem { text: String },
    DeleteItem { item_id: Uuid },
    CreateAttribute { label: String, template: String },
    DeleteAttribute { attribute_id: Uuid },
    SortMissingPairs,
    PauseVoting,
    ResumeVoting,
    StopVoting,
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
    static ref VOTING_SESSIONS: Arc<Mutex<HashMap<Uuid, VotingSession>>> = Arc::new(Mutex::new(HashMap::new()));
}

// Session state for each WebSocket connection
#[derive(Debug)]
struct SessionState {
    current_tag_id: Option<Uuid>, // For tag detail pages
    tags_list_state: TagsListPageState,
    // Track selected state per tag
    tag_selections: HashMap<Uuid, TagSelectionState>,
    // Track voting session for this connection
    voting_session_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
struct TagSelectionState {
    selected_voters: Vec<Uuid>,
    selected_attributes: Vec<Uuid>,
}

impl SessionState {
    fn new() -> Self {
        Self {
            current_tag_id: None,
            tags_list_state: TagsListPageState {
                tags: Vec::new(),
            },
            tag_selections: HashMap::new(),
            voting_session_id: None,
        }
    }
    
    fn get_or_create_tag_selection(&mut self, tag_id: Uuid) -> &mut TagSelectionState {
        self.tag_selections.entry(tag_id).or_insert_with(|| TagSelectionState {
            selected_voters: Vec::new(),
            selected_attributes: Vec::new(),
        })
    }
}

// OpenRouter API integration
async fn call_openrouter_api(
    model: &str,
    prompt: &str,
) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let api_key = std::env::var("OPENROUTER_API_KEY")
        .map_err(|_| "OPENROUTER_API_KEY environment variable not set")?;
    
    let client = reqwest::Client::new();
    let request = OpenRouterRequest {
        model: model.to_string(),
        messages: vec![OpenRouterMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
        }],
        max_tokens: Some(500),
        temperature: Some(0.7),
    };
    
    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await?;
    
    if !response.status().is_success() {
        let error_text = response.text().await?;
        return Err(format!("OpenRouter API error: {}", error_text).into());
    }
    
    let openrouter_response: OpenRouterResponse = response.json().await?;
    
    if let Some(choice) = openrouter_response.choices.first() {
        Ok(choice.message.content.clone())
    } else {
        Err("No response from OpenRouter API".into())
    }
}

// Extract score from AI response using regex
fn extract_score_from_response(response: &str) -> Option<i32> {
    let score_regex = Regex::new(r"SCORE:\s*(-?\d+)").ok()?;
    if let Some(captures) = score_regex.captures(response) {
        captures.get(1)?.as_str().parse().ok()
    } else {
        None
    }
}

// Generate missing comparisons for voting
fn generate_missing_comparisons(
    tag_id: Uuid,
    selected_voters: &[Uuid],
    selected_attributes: &[Uuid],
) -> Vec<MissingComparison> {
    let items: Vec<Item> = {
        let items = ITEMS.lock().unwrap();
        items.values()
            .filter(|item| item.tag_id == tag_id)
            .cloned()
            .collect()
    };
    
    if items.len() < 2 {
        return Vec::new();
    }
    
    let votes = VOTES.lock().unwrap();
    let existing_votes: HashSet<(Uuid, Uuid, Uuid, Uuid)> = votes
        .iter()
        .filter(|vote| vote.tag_id == tag_id)
        .filter(|vote| {
            // Only consider votes from selected voters and attributes when determining missing comparisons
            selected_voters.contains(&vote.voter_id) && selected_attributes.contains(&vote.attribute_id)
        })
        .map(|vote| (vote.voter_id, vote.attribute_id, vote.item_a_id, vote.item_b_id))
        .collect();
    
    let mut missing_comparisons = Vec::new();
    
    // Generate all possible pairs
    for i in 0..items.len() {
        for j in (i + 1)..items.len() {
            let item_a = &items[i];
            let item_b = &items[j];
            
            // Check if we need votes for this pair
            for &voter_id in selected_voters {
                for &attribute_id in selected_attributes {
                    let forward_key = (voter_id, attribute_id, item_a.id, item_b.id);
                    let reverse_key = (voter_id, attribute_id, item_b.id, item_a.id);
                    
                    if !existing_votes.contains(&forward_key) && !existing_votes.contains(&reverse_key) {
                        missing_comparisons.push(MissingComparison {
                            item_a_id: item_a.id,
                            item_b_id: item_b.id,
                            item_a_text: item_a.text.clone(),
                            item_b_text: item_b.text.clone(),
                        });
                        break; // Only add the comparison once, not for each voter/attribute combo
                    }
                }
            }
        }
    }
    
    // Shuffle for randomness
    let mut rng = rand::thread_rng();
    missing_comparisons.shuffle(&mut rng);
    
    missing_comparisons
}

// Process voting session with pausable functionality
async fn process_voting_session(
    session_id: Uuid,
    tx: mpsc::UnboundedSender<WsEvent>,
    session_state: Arc<Mutex<SessionState>>,
) {
    loop {
        // Check if session still exists and get current state
        let (tag_id, voter_ids, attribute_ids, comparison, should_continue) = {
            let mut sessions = VOTING_SESSIONS.lock().unwrap();
            if let Some(session) = sessions.get_mut(&session_id) {
                if session.is_paused {
                    // Session is paused, wait and check again
                    drop(sessions);
                    return; // Exit the function, will be restarted when resumed
                }
                
                if session.current_index >= session.comparisons.len() {
                    // Voting complete
                    let tag_id = session.tag_id;
                    sessions.remove(&session_id);
                    drop(sessions);
                    
                    // Clear session state
                    {
                        let mut session_state = session_state.lock().unwrap();
                        session_state.voting_session_id = None;
                    }
                    
                    // Send final page state update
                    let page_state = build_tag_detail_page_state(tag_id, &session_state);
                    let _ = tx.send(WsEvent::PageState { state: page_state });
                    return;
                }
                
                let comparison = session.comparisons[session.current_index].clone();
                let result = (
                    session.tag_id,
                    session.voter_ids.clone(),
                    session.attribute_ids.clone(),
                    comparison,
                    true,
                );
                drop(sessions); // Release lock before continuing
                result
            } else {
                // Session was removed, exit
                return;
            }
        };
        
        if !should_continue {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            continue;
        }
        
        // Process current comparison
        for voter_id in &voter_ids {
            for attribute_id in &attribute_ids {
                // Get voter and attribute details
                let (voter_name, attribute_template) = {
                    let voters = VOTERS.lock().unwrap();
                    let attributes = ATTRIBUTES.lock().unwrap();
                    
                    let voter = voters.get(voter_id);
                    let attribute = attributes.get(attribute_id);
                    
                    match (voter, attribute) {
                        (Some(v), Some(a)) => (v.name.clone(), a.template.clone()),
                        _ => {
                            log::error!("Missing voter or attribute for voting");
                            continue;
                        }
                    }
                };
                
                // Create prompt by substituting placeholders
                let prompt = attribute_template
                    .replace("{{A}}", &comparison.item_a_text)
                    .replace("{{B}}", &comparison.item_b_text);
                
                // Call OpenRouter API
                match call_openrouter_api(&voter_name, &prompt).await {
                    Ok(response) => {
                        // Extract score from response
                        if let Some(score) = extract_score_from_response(&response) {
                            // Create vote record
                            let vote_id = {
                                let mut counter = VOTE_ID_COUNTER.lock().unwrap();
                                let id = *counter;
                                *counter += 1;
                                id
                            };
                            
                            let vote = Vote {
                                id: vote_id,
                                tag_id,
                                attribute_id: *attribute_id,
                                voter_id: *voter_id,
                                item_a_id: comparison.item_a_id,
                                item_b_id: comparison.item_b_id,
                                score,
                                rationale: Some(response),
                                created_at: chrono::Utc::now().to_rfc3339(),
                            };
                            
                            // Store vote
                            VOTES.lock().unwrap().push(vote);
                            
                            log::info!("Vote recorded: {} vs {} = {} (voter: {}, attribute: {})", 
                                comparison.item_a_text, comparison.item_b_text, score, voter_name, attribute_id);
                        } else {
                            log::warn!("Could not extract score from response: {}", response);
                        }
                    }
                    Err(e) => {
                        log::error!("OpenRouter API call failed: {}", e);
                        // Continue with next voter/attribute
                    }
                }
                
                // Small delay between API calls to avoid rate limiting
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
        }
        
        // Update progress
        let (completed, total, should_update_page) = {
            let mut sessions = VOTING_SESSIONS.lock().unwrap();
            if let Some(session) = sessions.get_mut(&session_id) {
                session.current_index += 1;
                let completed = session.current_index;
                let total = session.total_comparisons;
                let should_update = completed % 5 == 0 || completed >= total;
                (completed, total, should_update)
            } else {
                return; // Session was removed
            }
        };
        
        // Send progress update
        let _ = tx.send(WsEvent::VotingProgress { 
            completed, 
            total 
        });
        
        // Send updated page state periodically
        if should_update_page {
            let page_state = build_tag_detail_page_state(tag_id, &session_state);
            let _ = tx.send(WsEvent::PageState { state: page_state });
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
        
        WsCommand::CreateTag { name } => {
            if !name.trim().is_empty() {
                let tag_id = Uuid::new_v4();
                let tag = Tag {
                    id: tag_id,
                    name: name.trim().to_string(),
                    created_at: chrono::Utc::now().to_rfc3339(),
                };
                
                TAGS.lock().unwrap().insert(tag_id, tag.clone());
                
                // Navigate to the new tag detail page
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        // Tag detail page commands
        WsCommand::UpdateSelectedVoters { voter_ids } => {
            let tag_id = {
                let mut session = session_state.lock().unwrap();
                if let Some(tag_id) = session.current_tag_id {
                    let selection = session.get_or_create_tag_selection(tag_id);
                    selection.selected_voters = voter_ids;
                    Some(tag_id)
                } else {
                    None
                }
            };
            
            if let Some(tag_id) = tag_id {
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::UpdateSelectedAttributes { attribute_ids } => {
            let tag_id = {
                let mut session = session_state.lock().unwrap();
                if let Some(tag_id) = session.current_tag_id {
                    let selection = session.get_or_create_tag_selection(tag_id);
                    selection.selected_attributes = attribute_ids;
                    Some(tag_id)
                } else {
                    None
                }
            };
            
            if let Some(tag_id) = tag_id {
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::AddItem { text } => {
            let tag_id = {
                let session = session_state.lock().unwrap();
                session.current_tag_id
            }; // Release session lock here
            
            if let Some(tag_id) = tag_id {
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
            let tag_id = {
                let session = session_state.lock().unwrap();
                session.current_tag_id
            }; // Release session lock here
            
            if let Some(tag_id) = tag_id {
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
        
        WsCommand::CreateOrSelectVoter { name } => {
            if !name.trim().is_empty() {
                let voter_name = name.trim().to_string();
                
                // Check if voter already exists
                let existing_voter_id = {
                    let voters = VOTERS.lock().unwrap();
                    voters.values()
                        .find(|v| v.name == voter_name)
                        .map(|v| v.id)
                };
                
                let voter_id = if let Some(id) = existing_voter_id {
                    id
                } else {
                    // Create new voter
                    let new_id = Uuid::new_v4();
                    let voter = Voter {
                        id: new_id,
                        name: voter_name,
                        is_ai: true,
                    };
                    VOTERS.lock().unwrap().insert(new_id, voter);
                    new_id
                };
                
                // Get current tag_id
                let tag_id = {
                    let session = session_state.lock().unwrap();
                    session.current_tag_id
                };
                
                if let Some(tag_id) = tag_id {
                    // Add voter to selected voters in session state
                    {
                        let mut session = session_state.lock().unwrap();
                        let selection = session.get_or_create_tag_selection(tag_id);
                        if !selection.selected_voters.contains(&voter_id) {
                            selection.selected_voters.push(voter_id);
                        }
                    }
                    
                    // Send back the updated page state
                    let page_state = build_tag_detail_page_state(tag_id, &session_state);
                    let _ = tx.send(WsEvent::PageState { state: page_state });
                }
            }
        }


        
        WsCommand::DeleteItem { item_id } => {
            ITEMS.lock().unwrap().remove(&item_id);
            
            let tag_id = {
                let session = session_state.lock().unwrap();
                session.current_tag_id
            };
            
            if let Some(tag_id) = tag_id {
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::DeleteAttribute { attribute_id } => {
            ATTRIBUTES.lock().unwrap().remove(&attribute_id);
            
            let tag_id = {
                let session = session_state.lock().unwrap();
                session.current_tag_id
            };
            
            if let Some(tag_id) = tag_id {
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::SortMissingPairs => {
            let tag_id = {
                let session = session_state.lock().unwrap();
                session.current_tag_id
            };
            
            if let Some(tag_id) = tag_id {
                // Get selected voters and attributes
                let (selected_voters, selected_attributes) = {
                    let mut session = session_state.lock().unwrap();
                    let selection = session.get_or_create_tag_selection(tag_id);
                    (selection.selected_voters.clone(), selection.selected_attributes.clone())
                };
                
                if selected_voters.is_empty() || selected_attributes.is_empty() {
                    let _ = tx.send(WsEvent::Error { 
                        message: "Please select at least one voter and one attribute".to_string() 
                    });
                    return;
                }
                
                // Generate missing comparisons
                let missing_comparisons = generate_missing_comparisons(tag_id, &selected_voters, &selected_attributes);
                
                if missing_comparisons.is_empty() {
                    let _ = tx.send(WsEvent::Error { 
                        message: "No missing comparisons found".to_string() 
                    });
                    return;
                }
                
                // Create voting session
                let session_id = Uuid::new_v4();
                let voting_session = VotingSession {
                    tag_id,
                    voter_ids: selected_voters,
                    attribute_ids: selected_attributes,
                    comparisons: missing_comparisons.clone(),
                    current_index: 0,
                    is_paused: false,
                    total_comparisons: missing_comparisons.len(),
                };
                
                // Store voting session
                VOTING_SESSIONS.lock().unwrap().insert(session_id, voting_session);
                
                // Update session state
                {
                    let mut session = session_state.lock().unwrap();
                    session.voting_session_id = Some(session_id);
                }
                
                // Start voting process
                let tx_clone = tx.clone();
                let session_state_clone = session_state.clone();
                tokio::spawn(async move {
                    process_voting_session(session_id, tx_clone, session_state_clone).await;
                });
                
                                 // Send initial progress
                 let _ = tx.send(WsEvent::VotingProgress { 
                     completed: 0, 
                     total: missing_comparisons.len() 
                 });
             }
         }
         
         WsCommand::PauseVoting => {
             let session_id = {
                 let session = session_state.lock().unwrap();
                 session.voting_session_id
             };
             
             if let Some(session_id) = session_id {
                 let mut sessions = VOTING_SESSIONS.lock().unwrap();
                 if let Some(session) = sessions.get_mut(&session_id) {
                     session.is_paused = true;
                     log::info!("Voting session {} paused", session_id);
                 }
             }
         }
         
         WsCommand::ResumeVoting => {
             let session_id = {
                 let session = session_state.lock().unwrap();
                 session.voting_session_id
             };
             
             if let Some(session_id) = session_id {
                 let mut sessions = VOTING_SESSIONS.lock().unwrap();
                 if let Some(session) = sessions.get_mut(&session_id) {
                     session.is_paused = false;
                     log::info!("Voting session {} resumed", session_id);
                 }
             }
         }
         
         WsCommand::StopVoting => {
             let (session_id, tag_id) = {
                 let mut session = session_state.lock().unwrap();
                 let session_id = session.voting_session_id.take();
                 let tag_id = session.current_tag_id;
                 (session_id, tag_id)
             };
             
             if let Some(session_id) = session_id {
                 VOTING_SESSIONS.lock().unwrap().remove(&session_id);
                 log::info!("Voting session {} stopped", session_id);
                 
                 // Send updated page state
                 if let Some(tag_id) = tag_id {
                     let page_state = build_tag_detail_page_state(tag_id, &session_state);
                     let _ = tx.send(WsEvent::PageState { state: page_state });
                 }
             }
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
    
    // Get selected state from session and check voting status
    let (selected_voters, selected_attributes, is_voting_in_progress) = {
        let mut session = session_state.lock().unwrap();
        let selection = session.get_or_create_tag_selection(tag_id);
        let selected_voters = selection.selected_voters.clone();
        let selected_attributes = selection.selected_attributes.clone();
        let voting_session_id = session.voting_session_id;
        drop(session); // Release the lock before checking voting sessions
        
        let is_voting = if let Some(session_id) = voting_session_id {
            VOTING_SESSIONS.lock().unwrap().contains_key(&session_id)
        } else {
            false
        };
        (selected_voters, selected_attributes, is_voting)
    };
    
    // Filter votes by selected voters and attributes
    let filtered_votes: Vec<Vote> = votes
        .iter()
        .filter(|vote| {
            (selected_voters.is_empty() || selected_voters.contains(&vote.voter_id)) &&
            (selected_attributes.is_empty() || selected_attributes.contains(&vote.attribute_id))
        })
        .cloned()
        .collect();
    
    // Calculate derived state using filtered votes
    let voters_with_votes = calculate_voters_with_votes(&filtered_votes);
    let rankings = calculate_rankings(&items, &filtered_votes);
    
    // Separate sorted and unsorted items based on filtered votes
    let voted_item_ids: HashSet<Uuid> = filtered_votes
        .iter()
        .flat_map(|vote| [vote.item_a_id, vote.item_b_id])
        .collect();
    
    let unsorted_items: Vec<Item> = items
        .iter()
        .filter(|item| !voted_item_ids.contains(&item.id))
        .cloned()
        .collect();
    
    let unvoted_item_count = unsorted_items.len();
    
    let state = TagDetailPageState {
        tag,
        sorted_items: rankings.clone(), // Items with votes and rankings
        unsorted_items, // Items without votes
        attributes,
        voters,
        votes,
        rankings, // Keep for backward compatibility
        unvoted_item_count, // Count of items without votes
        voters_with_votes,
        selected_attributes,
        selected_voters,
        is_voting_in_progress,
    };
    
    PageState::TagDetail(state)
}

fn calculate_voters_with_votes(votes: &[Vote]) -> Vec<Uuid> {
    let mut voter_ids: HashSet<Uuid> = HashSet::new();
    for vote in votes {
        voter_ids.insert(vote.voter_id);
    }
    voter_ids.into_iter().collect()
}



fn calculate_rankings(items: &[Item], votes: &[Vote]) -> Vec<RankedItem> {
    if items.is_empty() || votes.is_empty() {
        return Vec::new();
    }

    // Find items that have votes
    let voted_item_ids: HashSet<Uuid> = votes
        .iter()
        .flat_map(|vote| [vote.item_a_id, vote.item_b_id])
        .collect();

    // Only include items that have votes
    let voted_items: Vec<&Item> = items
        .iter()
        .filter(|item| voted_item_ids.contains(&item.id))
        .collect();

    if voted_items.is_empty() {
        return Vec::new();
    }

    // Convert voted items to EntityIdentifier format
    let entities: Vec<EntityIdentifier> = voted_items
        .iter()
        .map(|item| EntityIdentifier {
            pk_namespace: "item".to_string(),
            pk: item.id.to_string(),
        })
        .collect();

    // Convert votes to RelevantVote format
    let pagerank_votes: Vec<RelevantVote> = votes
        .iter()
        .map(|vote| RelevantVote {
            left_entity_pk_namespace: "item".to_string(),
            left_entity_pk: vote.item_a_id.to_string(),
            right_entity_pk_namespace: "item".to_string(),
            right_entity_pk: vote.item_b_id.to_string(),
            magnitude: vote.score,
        })
        .collect();

    // Build the ranking graph
    let rank_graph = match build_rank_graph(&entities, &pagerank_votes) {
        Ok(graph) => graph,
        Err(e) => {
            log::error!("Failed to build ranking graph: {:?}", e);
            return Vec::new();
        }
    };

    // Calculate Tommy Rank scores
    let scores = calculate_tommy_rank(&rank_graph.graph, 100000, 1e-8);

    // Create ranked items with scores (only for items that have votes)
    let mut ranked_items: Vec<RankedItem> = Vec::new();
    
    for (index, score) in scores.iter().enumerate() {
        if let Some(entity_id) = rank_graph.index_to_entity_identifier.get(&index) {
            if let Ok(item_uuid) = Uuid::parse_str(&entity_id.pk) {
                if let Some(item) = voted_items.iter().find(|i| i.id == item_uuid) {
                    ranked_items.push(RankedItem {
                        item_id: item.id,
                        rank: 0, // Will be set after sorting
                        score: *score as f64,
                        text: item.text.clone(),
                    });
                }
            }
        }
    }

    // Sort by score (descending) and assign ranks
    ranked_items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    for (i, item) in ranked_items.iter_mut().enumerate() {
        item.rank = i + 1;
    }

    ranked_items
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/ws", axum::routing::get(ws_handler))
} 