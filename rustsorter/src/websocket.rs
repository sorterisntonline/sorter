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
    ToggleNewAttributeForm,
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
    // Track selected state per tag
    tag_selections: HashMap<Uuid, TagSelectionState>,
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
        }
    }
    
    fn get_or_create_tag_selection(&mut self, tag_id: Uuid) -> &mut TagSelectionState {
        self.tag_selections.entry(tag_id).or_insert_with(|| TagSelectionState {
            selected_voters: Vec::new(),
            selected_attributes: Vec::new(),
        })
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

        WsCommand::ToggleNewAttributeForm => {
            let tag_id = {
                let session = session_state.lock().unwrap();
                session.current_tag_id
            };
            
            if let Some(tag_id) = tag_id {
                // For now, just toggle in the rebuilt state
                // In a real implementation, you'd track this in session state
                let page_state = build_tag_detail_page_state(tag_id, &session_state);
                let _ = tx.send(WsEvent::PageState { state: page_state });
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
            // TODO: Implement voting logic
            let _ = tx.send(WsEvent::Error { 
                message: "Voting not implemented yet".to_string() 
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
    
    // Get selected state from session to calculate missing comparisons
    let (selected_voters, selected_attributes) = {
        let mut session = session_state.lock().unwrap();
        let selection = session.get_or_create_tag_selection(tag_id);
        (selection.selected_voters.clone(), selection.selected_attributes.clone())
    };
    
    let missing_comparisons = calculate_missing_comparisons(&items, &votes, &selected_voters, &selected_attributes);
    
    // Note: selected_voters and selected_attributes already obtained above
    
    let state = TagDetailPageState {
        tag,
        items,
        attributes,
        voters,
        votes,
        rankings,
        missing_comparisons,
        voters_with_votes,
        selected_attributes,
        selected_voters,
        is_voting_in_progress: false,
        show_new_attribute_form: false,
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

fn calculate_missing_comparisons(
    items: &[Item], 
    votes: &[Vote], 
    _selected_voters: &[Uuid], 
    _selected_attributes: &[Uuid]
) -> Vec<MissingComparison> {
    // Shortcut: Just return the number of unsorted items as missing comparisons
    // Find items that have votes
    let voted_item_ids: HashSet<Uuid> = votes
        .iter()
        .flat_map(|vote| [vote.item_a_id, vote.item_b_id])
        .collect();

    // Create fake missing comparisons for items without votes
    let mut missing_comparisons = Vec::new();
    for item in items {
        if !voted_item_ids.contains(&item.id) {
            // Create a dummy comparison entry for this unvoted item
            missing_comparisons.push(MissingComparison {
                item_a_id: item.id,
                item_b_id: item.id, // Same item for both sides as a placeholder
                item_a_text: item.text.clone(),
                item_b_text: format!("(unvoted: {})", item.text),
            });
        }
    }

    missing_comparisons
}

fn calculate_rankings(items: &[Item], votes: &[Vote]) -> Vec<RankedItem> {
    if items.is_empty() {
        return Vec::new();
    }

    // Convert items to EntityIdentifier format
    let entities: Vec<EntityIdentifier> = items
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

    // If no votes, return items in original order with equal scores
    if pagerank_votes.is_empty() {
        return items.iter().enumerate().map(|(i, item)| RankedItem {
            item_id: item.id,
            rank: i + 1,
            score: 1.0,
            text: item.text.clone(),
        }).collect();
    }

    // Build the ranking graph
    let rank_graph = match build_rank_graph(&entities, &pagerank_votes) {
        Ok(graph) => graph,
        Err(e) => {
            log::error!("Failed to build ranking graph: {:?}", e);
            // Fallback to equal scores
            return items.iter().enumerate().map(|(i, item)| RankedItem {
                item_id: item.id,
                rank: i + 1,
                score: 1.0,
                text: item.text.clone(),
            }).collect();
        }
    };

    // Calculate Tommy Rank scores
    let scores = calculate_tommy_rank(&rank_graph.graph, 100000, 1e-8);

    // Create ranked items with scores
    let mut ranked_items: Vec<RankedItem> = Vec::new();
    
    // Add items that have votes (ranked items)
    for (index, score) in scores.iter().enumerate() {
        if let Some(entity_id) = rank_graph.index_to_entity_identifier.get(&index) {
            if let Ok(item_uuid) = Uuid::parse_str(&entity_id.pk) {
                if let Some(item) = items.iter().find(|i| i.id == item_uuid) {
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

    // Add items that don't have votes (unranked items) with score 0
    let voted_item_ids: HashSet<Uuid> = ranked_items.iter().map(|ri| ri.item_id).collect();
    for item in items {
        if !voted_item_ids.contains(&item.id) {
            ranked_items.push(RankedItem {
                item_id: item.id,
                rank: 0, // Will be set after sorting
                score: 0.0,
                text: item.text.clone(),
            });
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