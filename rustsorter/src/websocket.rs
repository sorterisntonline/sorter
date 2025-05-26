use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::app_state::AppState;
use crate::pagerank::{EntityIdentifier, RankedEntity, RelevantVote, build_rank_graph, calculate_tommy_rank};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use reqwest;
use regex::Regex;

const OPENROUTER_API_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter API structures
#[derive(Debug, Serialize)]
struct OpenRouterRequest {
    model: String,
    messages: Vec<OpenRouterMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
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
    message: OpenRouterMessage,
}

// Core data structures for the new architecture
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
    pub score: i32, // -50 to 50
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryState {
    pub tag_id: Uuid,
    pub selected_attributes: Vec<Uuid>,
    pub selected_voters: Vec<Uuid>,
    pub rankings: Vec<RankedItem>,
    pub missing_comparisons: Vec<MissingComparison>,
    pub all_items: Vec<Item>,
    pub all_attributes: Vec<Attribute>,
    pub all_voters: Vec<Voter>,
    pub voters_with_votes: Vec<Uuid>,
}

// WebSocket commands from client
#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum WsCommand {
    // Tag commands
    CreateTag { name: String },
    GetTag { tag_id: Uuid },
    ListTags,
    
    // Item commands
    AddItem { tag_id: Uuid, text: String },
    DeleteItem { tag_id: Uuid, item_id: Uuid },
    
    // Attribute (prompt) commands
    CreateAttribute { tag_id: Uuid, label: String, template: String },
    UpdateAttribute { attribute_id: Uuid, label: String, template: String },
    DeleteAttribute { attribute_id: Uuid },
    ListAttributes { tag_id: Uuid },
    
    // Query commands
    UpdateQuery { 
        tag_id: Uuid, 
        attribute_ids: Vec<Uuid>, 
        voter_ids: Vec<Uuid> 
    },
    
    // Voting commands
    SortMissingPairs { 
        tag_id: Uuid,
        attribute_ids: Vec<Uuid>,
        voter_ids: Vec<Uuid>,
        limit: Option<usize> // How many pairs to sort
    },
    
    // Voter commands
    ListVoters,
    CreateHumanVoter { name: String },
}

// WebSocket events to client
#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum WsEvent {
    // General events
    Connected { user_id: Option<Uuid> },
    Error { message: String },
    
    // Tag events
    TagCreated { tag: Tag },
    TagData { tag: Tag },
    TagsList { tags: Vec<Tag> },
    
    // Item events
    ItemAdded { tag_id: Uuid, item: Item },
    ItemDeleted { tag_id: Uuid, item_id: Uuid },
    
    // Attribute events
    AttributeCreated { attribute: Attribute },
    AttributeUpdated { attribute: Attribute },
    AttributeDeleted { attribute_id: Uuid },
    AttributesList { attributes: Vec<Attribute> },
    
    // Query events
    QueryUpdated { state: QueryState },
    
    // Voting events
    VotingStarted { tag_id: Uuid, total_comparisons: usize },
    VoteAdded { vote: Vote },
    VotingProgress { completed: usize, total: usize },
    VotingCompleted { tag_id: Uuid },
    
    // Voter events
    VotersList { voters: Vec<Voter> },
    VoterCreated { voter: Voter },
}

// Mock data stores (in production, these would be database tables)
lazy_static::lazy_static! {
    static ref TAGS: Arc<Mutex<HashMap<Uuid, Tag>>> = Arc::new(Mutex::new({
        let mut tags = HashMap::new();
        let tag_id = Uuid::new_v4();
        tags.insert(tag_id, Tag {
            id: tag_id,
            name: "Startup Ideas".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        });
        tags
    }));
    
    static ref ITEMS: Arc<Mutex<HashMap<Uuid, Item>>> = Arc::new(Mutex::new({
        let mut items = HashMap::new();
        let tag_id = TAGS.lock().unwrap().keys().next().unwrap().clone();
        
        let ideas = vec![
            "AI-powered personal nutrition coach that creates meal plans based on your DNA",
            "Blockchain-based supply chain for verifying organic food authenticity",
            "VR platform for remote team building and collaboration",
        ];
        
        for idea in ideas {
            let item_id = Uuid::new_v4();
            items.insert(item_id, Item {
                id: item_id,
                tag_id,
                text: idea.to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
            });
        }
        items
    }));
    
    static ref ATTRIBUTES: Arc<Mutex<HashMap<Uuid, Attribute>>> = Arc::new(Mutex::new({
        let mut attrs = HashMap::new();
        let tag_id = TAGS.lock().unwrap().keys().next().unwrap().clone();
        
        // Default attribute
        let attr_id = Uuid::new_v4();
        attrs.insert(attr_id, Attribute {
            id: attr_id,
            tag_id,
            label: "Pure Preference".to_string(),
            template: r#"Between A and B, which do you prefer?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

if -50 is strongly prefer A, and 50 is strongly prefer B, then your answer should be a number between -50 and 50.
respond with some reasoning and your score. Your score will be read by this regex: /SCORE: (-?\d+)/"#.to_string(),
            created_by: Uuid::new_v4(), // System user
            created_at: chrono::Utc::now().to_rfc3339(),
        });
        attrs
    }));
    
    static ref VOTES: Arc<Mutex<Vec<Vote>>> = Arc::new(Mutex::new(Vec::new()));
    
    static ref VOTERS: Arc<Mutex<HashMap<Uuid, Voter>>> = Arc::new(Mutex::new({
        let mut voters = HashMap::new();
        
        // Pre-populate with common AI models
        let ai_models = vec![
            "openai/gpt-4",
            "openai/gpt-4o", 
            "anthropic/claude-3-opus",
            "anthropic/claude-3-sonnet",
        ];
        
        for model in ai_models {
            let voter_id = Uuid::new_v4();
            voters.insert(voter_id, Voter {
                id: voter_id,
                name: model.to_string(),
                is_ai: true,
            });
        }
        
        voters
    }));
    
    static ref VOTE_ID_COUNTER: Arc<Mutex<i64>> = Arc::new(Mutex::new(1));
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
    
    // Send connected event
    let connected_event = WsEvent::Connected { user_id: None };
    if let Ok(msg) = serde_json::to_string(&connected_event) {
        let _ = sender.send(Message::Text(msg)).await;
    }
    
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
                    handle_command(cmd, tx.clone(), &state).await;
                }
                Err(e) => {
                    let error_event = WsEvent::Error { 
                        message: format!("Invalid command: {}", e) 
                    };
                    let _ = tx.send(error_event);
                }
            }
        }
    }
    
    // Clean up
    send_task.abort();
}

async fn handle_command(
    cmd: WsCommand,
    tx: mpsc::UnboundedSender<WsEvent>,
    state: &AppState,
) {
    log::info!("Received command: {:?}", cmd);
    match cmd {
        WsCommand::CreateTag { name } => {
            let tag_id = Uuid::new_v4();
            let tag = Tag {
                id: tag_id,
                name,
                created_at: chrono::Utc::now().to_rfc3339(),
            };
            
            TAGS.lock().unwrap().insert(tag_id, tag.clone());
            let _ = tx.send(WsEvent::TagCreated { tag });
        }
        
        WsCommand::GetTag { tag_id } => {
            let tags = TAGS.lock().unwrap();
            if let Some(tag) = tags.get(&tag_id) {
                let _ = tx.send(WsEvent::TagData { tag: tag.clone() });
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Tag {} not found", tag_id) 
                });
            }
        }
        
        WsCommand::ListTags => {
            let tags = TAGS.lock().unwrap();
            let tags_list: Vec<Tag> = tags.values().cloned().collect();
            let _ = tx.send(WsEvent::TagsList { tags: tags_list });
        }
        
        WsCommand::AddItem { tag_id, text } => {
            let tags = TAGS.lock().unwrap();
            if tags.contains_key(&tag_id) {
                let item_id = Uuid::new_v4();
                let item = Item {
                    id: item_id,
                    tag_id,
                    text,
                    created_at: chrono::Utc::now().to_rfc3339(),
                };
                
                ITEMS.lock().unwrap().insert(item_id, item.clone());
                let _ = tx.send(WsEvent::ItemAdded { tag_id, item });
                
                // Automatically trigger query update to show new item in rankings
                drop(tags);
                update_query_state(tag_id, vec![], vec![], &tx);
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Tag {} not found", tag_id) 
                });
            }
        }
        
        WsCommand::DeleteItem { tag_id, item_id } => {
            let mut items = ITEMS.lock().unwrap();
            if let Some(item) = items.get(&item_id) {
                if item.tag_id == tag_id {
                    items.remove(&item_id);
                    
                    // Remove all votes involving this item
                    let mut votes = VOTES.lock().unwrap();
                    votes.retain(|vote| vote.item_a_id != item_id && vote.item_b_id != item_id);
                    
                    let _ = tx.send(WsEvent::ItemDeleted { tag_id, item_id });
                }
            }
        }
        
        WsCommand::CreateAttribute { tag_id, label, template } => {
            let attribute_id = Uuid::new_v4();
            let attribute = Attribute {
                id: attribute_id,
                tag_id,
                label,
                template,
                created_by: Uuid::new_v4(), // TODO: Use actual user ID
                    created_at: chrono::Utc::now().to_rfc3339(),
            };
            
            ATTRIBUTES.lock().unwrap().insert(attribute_id, attribute.clone());
            let _ = tx.send(WsEvent::AttributeCreated { attribute });
        }
        
        WsCommand::UpdateAttribute { attribute_id, label, template } => {
            let mut attributes = ATTRIBUTES.lock().unwrap();
            if let Some(attribute) = attributes.get_mut(&attribute_id) {
                attribute.label = label;
                attribute.template = template;
                let _ = tx.send(WsEvent::AttributeUpdated { attribute: attribute.clone() });
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Attribute {} not found", attribute_id) 
                });
            }
        }
        
        WsCommand::DeleteAttribute { attribute_id } => {
            let mut attributes = ATTRIBUTES.lock().unwrap();
            if attributes.remove(&attribute_id).is_some() {
                // Remove all votes using this attribute
                let mut votes = VOTES.lock().unwrap();
                votes.retain(|vote| vote.attribute_id != attribute_id);
                
                let _ = tx.send(WsEvent::AttributeDeleted { attribute_id });
            }
        }
        
        WsCommand::ListAttributes { tag_id } => {
            let attributes = ATTRIBUTES.lock().unwrap();
            let attrs_list: Vec<Attribute> = attributes.values()
                .filter(|attr| attr.tag_id == tag_id)
                .cloned()
                .collect();
            let _ = tx.send(WsEvent::AttributesList { attributes: attrs_list });
        }
        
        WsCommand::UpdateQuery { tag_id, attribute_ids, voter_ids } => {
            update_query_state(tag_id, attribute_ids, voter_ids, &tx);
        }
        
        WsCommand::SortMissingPairs { tag_id, attribute_ids, voter_ids, limit } => {
            // Get missing comparisons
            let missing = get_missing_comparisons(tag_id, &attribute_ids, &voter_ids);
            
            if missing.is_empty() {
                let _ = tx.send(WsEvent::VotingCompleted { tag_id });
                                    return;
                                }
            
            // Limit the number of comparisons if specified
            let comparisons_to_make: Vec<_> = if let Some(limit) = limit {
                missing.into_iter().take(limit).collect()
            } else {
                missing
            };
            
            let _ = tx.send(WsEvent::VotingStarted { 
                tag_id, 
                total_comparisons: comparisons_to_make.len() 
            });
            
            // Start voting process in background
            let tx_clone = tx.clone();
            tokio::spawn(async move {
                let mut completed = 0;
                let total = comparisons_to_make.len();
                
                for comparison in comparisons_to_make {
                    // Get all AI voters
                    let ai_voters: Vec<Voter> = voter_ids.iter()
                        .filter_map(|voter_id| {
                            let voters = VOTERS.lock().unwrap();
                            voters.get(voter_id).filter(|v| v.is_ai).cloned()
                        })
                        .collect();
                    
                    // Get all attributes
                    let attrs: Vec<Attribute> = attribute_ids.iter()
                        .filter_map(|attr_id| {
                            let attributes = ATTRIBUTES.lock().unwrap();
                            attributes.get(attr_id).cloned()
                        })
                                        .collect();
                    
                    // Make comparisons for each AI voter and attribute combination
                    for voter in &ai_voters {
                        for attribute in &attrs {
                            // Extract model name from voter name (e.g., "openai/gpt-4" -> "openai/gpt-4")
                            let model = &voter.name;
                            
                            match call_openrouter_api(
                                model,
                                &attribute.template,
                                &comparison.item_a_text,
                                &comparison.item_b_text,
                                ).await {
                                Ok((score, reasoning)) => {
                                    let vote_id = {
                                        let mut counter = VOTE_ID_COUNTER.lock().unwrap();
                                        let id = *counter;
                                        *counter += 1;
                                        id
                                };
                                
                                let vote = Vote {
                                        id: vote_id,
                                        tag_id,
                                        attribute_id: attribute.id,
                                        voter_id: voter.id,
                                        item_a_id: comparison.item_a_id,
                                        item_b_id: comparison.item_b_id,
                                    score,
                                        rationale: Some(reasoning),
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                };
                                
                                    VOTES.lock().unwrap().push(vote.clone());
                                    let _ = tx_clone.send(WsEvent::VoteAdded { vote });
                                }
                                Err(e) => {
                                    log::error!("OpenRouter API error: {}", e);
                                    let _ = tx_clone.send(WsEvent::Error { 
                                        message: format!("API error: {}", e) 
                                    });
                                }
                            }
                            
                            // Small delay between API calls
                            sleep(Duration::from_millis(500)).await;
                        }
                    }
                    
                    completed += 1;
                    let _ = tx_clone.send(WsEvent::VotingProgress { 
                        completed, 
                        total 
                    });
                }
                
                let _ = tx_clone.send(WsEvent::VotingCompleted { tag_id });
                
                // Update query state with new rankings
                update_query_state(tag_id, attribute_ids, voter_ids, &tx_clone);
            });
        }
        
        WsCommand::ListVoters => {
            let voters = VOTERS.lock().unwrap();
            let voters_list: Vec<Voter> = voters.values().cloned().collect();
            let _ = tx.send(WsEvent::VotersList { voters: voters_list });
        }
        
        WsCommand::CreateHumanVoter { name } => {
            let voter_id = Uuid::new_v4();
            
            // Check if this is actually an AI model by name pattern
            let is_ai = name.contains('/') || name.starts_with("gpt-") || name.starts_with("claude-");
            
            let voter = Voter {
                id: voter_id,
                name,
                is_ai,
            };
            
            VOTERS.lock().unwrap().insert(voter_id, voter.clone());
            let _ = tx.send(WsEvent::VoterCreated { voter });
        }
    }
}

fn update_query_state(
    tag_id: Uuid,
    attribute_ids: Vec<Uuid>,
    voter_ids: Vec<Uuid>,
    tx: &mpsc::UnboundedSender<WsEvent>,
) {
    // Get all items for this tag
    let tag_items: Vec<Item> = {
        let items = ITEMS.lock().unwrap();
        items.values()
            .filter(|item| item.tag_id == tag_id)
            .cloned()
            .collect()
    }; // Lock released here
    
    // Get all votes for this tag to determine which voters have voted
    let all_tag_votes: Vec<Vote> = {
        let votes = VOTES.lock().unwrap();
        votes.iter()
            .filter(|vote| vote.tag_id == tag_id)
            .cloned()
            .collect()
    }; // Lock released here
    
    // Get unique voter IDs that have cast votes for this tag
    let mut voters_with_votes: HashSet<Uuid> = HashSet::new();
    for vote in &all_tag_votes {
        voters_with_votes.insert(vote.voter_id);
    }
    let voters_with_votes_vec: Vec<Uuid> = voters_with_votes.into_iter().collect();
    
    // Determine which voter IDs to use for rankings
    let effective_voter_ids = if voter_ids.is_empty() {
        // If no voters selected, use all voters that have cast votes
        voters_with_votes_vec.clone()
    } else {
        voter_ids.clone()
    };
    
    // Get relevant votes for ranking calculation
    let relevant_votes: Vec<Vote> = all_tag_votes.iter()
        .filter(|vote| {
            (attribute_ids.is_empty() || attribute_ids.contains(&vote.attribute_id)) &&
            effective_voter_ids.contains(&vote.voter_id)
        })
        .cloned()
        .collect();
    
    // Calculate rankings
    let rankings = calculate_rankings(&tag_items, &relevant_votes);
    
    // Get missing comparisons (only for explicitly selected voters)
    let missing_comparisons = get_missing_comparisons(tag_id, &attribute_ids, &voter_ids);
    
    // Get all attributes for this tag
    let all_attributes: Vec<Attribute> = {
        let attributes = ATTRIBUTES.lock().unwrap();
        attributes.values()
            .filter(|attr| attr.tag_id == tag_id)
            .cloned()
            .collect()
    }; // Lock released here
    
    // Get all voters
    let all_voters: Vec<Voter> = {
        let voters = VOTERS.lock().unwrap();
        voters.values().cloned().collect()
    }; // Lock released here
    
    let state = QueryState {
        tag_id,
        selected_attributes: attribute_ids,
        selected_voters: voter_ids,
        rankings,
        missing_comparisons,
        all_items: tag_items,
        all_attributes,
        all_voters,
        voters_with_votes: voters_with_votes_vec,
    };
    
    let _ = tx.send(WsEvent::QueryUpdated { state });
}

fn get_missing_comparisons(
    tag_id: Uuid,
    attribute_ids: &[Uuid],
    voter_ids: &[Uuid],
) -> Vec<MissingComparison> {
    // Get data and release locks immediately
    let tag_items: Vec<Item> = {
        let items = ITEMS.lock().unwrap();
        items.values()
            .filter(|item| item.tag_id == tag_id)
            .cloned()
            .collect()
    };
    
    let all_votes: Vec<Vote> = {
        let votes = VOTES.lock().unwrap();
        votes.iter()
            .filter(|vote| vote.tag_id == tag_id)
            .cloned()
            .collect()
    };
    
    // Only check AI voters
    let ai_voter_ids: Vec<Uuid> = {
        let voters = VOTERS.lock().unwrap();
        voter_ids.iter()
            .filter(|voter_id| {
                voters.get(voter_id).map(|v| v.is_ai).unwrap_or(false)
            })
            .cloned()
            .collect()
    };
    
    let mut missing = Vec::new();
    
    if ai_voter_ids.is_empty() || attribute_ids.is_empty() {
        return missing;
    }
    
    // Check all pairs
    for i in 0..tag_items.len() {
        for j in (i + 1)..tag_items.len() {
            let item_a = &tag_items[i];
            let item_b = &tag_items[j];
            
            // Check if we have votes for all selected voter/attribute combinations
            let mut has_all_votes = true;
            
            for voter_id in &ai_voter_ids {
                for attribute_id in attribute_ids {
                    let has_vote = all_votes.iter().any(|vote| {
                        vote.voter_id == *voter_id &&
                        vote.attribute_id == *attribute_id &&
                        ((vote.item_a_id == item_a.id && vote.item_b_id == item_b.id) ||
                         (vote.item_a_id == item_b.id && vote.item_b_id == item_a.id))
                    });
                    
                    if !has_vote {
                        has_all_votes = false;
                        break;
                    }
                }
                if !has_all_votes {
                    break;
                }
            }
            
            if !has_all_votes {
                missing.push(MissingComparison {
                    item_a_id: item_a.id,
                    item_b_id: item_b.id,
                    item_a_text: item_a.text.clone(),
                    item_b_text: item_b.text.clone(),
                });
            }
        }
    }

    missing
}

fn calculate_rankings(items: &[Item], votes: &[Vote]) -> Vec<RankedItem> {
    if votes.is_empty() {
        // If no votes, return items in original order with neutral scores
        return items.iter().enumerate().map(|(index, item)| RankedItem {
            item_id: item.id,
            rank: index + 1,
            score: 50.0,
            text: item.text.clone(),
        }).collect();
    }

    // Calculate aggregate scores
    let mut item_scores: HashMap<Uuid, f64> = HashMap::new();
    let mut item_vote_counts: HashMap<Uuid, usize> = HashMap::new();
    
    for item in items {
        item_scores.insert(item.id, 0.0);
        item_vote_counts.insert(item.id, 0);
    }
    
    for vote in votes {
        // Item A gets negative score (lower is better)
        if let Some(score_a) = item_scores.get_mut(&vote.item_a_id) {
            *score_a -= vote.score as f64;
            *item_vote_counts.get_mut(&vote.item_a_id).unwrap() += 1;
        }
        
        // Item B gets positive score
        if let Some(score_b) = item_scores.get_mut(&vote.item_b_id) {
            *score_b += vote.score as f64;
            *item_vote_counts.get_mut(&vote.item_b_id).unwrap() += 1;
        }
    }
    
    // Normalize scores by vote count
    for (item_id, score) in item_scores.iter_mut() {
        if let Some(count) = item_vote_counts.get(item_id) {
            if *count > 0 {
                *score = *score / *count as f64 + 50.0; // Normalize to 0-100 range
            } else {
                *score = 50.0; // Neutral score for items with no votes
            }
        }
    }
    
    // Create ranked list
    let mut ranked_items: Vec<RankedItem> = items.iter()
        .map(|item| RankedItem {
            item_id: item.id,
            rank: 0, // Will be set after sorting
            score: *item_scores.get(&item.id).unwrap_or(&50.0),
            text: item.text.clone(),
        })
        .collect();

    // Sort by score descending
    ranked_items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    // Assign ranks
    for (index, item) in ranked_items.iter_mut().enumerate() {
        item.rank = index + 1;
    }
    
    ranked_items
}

async fn call_openrouter_api(
    model: &str,
    prompt_template: &str,
    item_a: &str,
    item_b: &str,
) -> Result<(i32, String), String> {
    // Get API key from environment
    let api_key = std::env::var("OPENROUTER_API_KEY")
        .map_err(|_| "OPENROUTER_API_KEY not found in environment")?;
    
    // Format the prompt with items
    let formatted_prompt = prompt_template
        .replace("{{A}}", item_a)
        .replace("{{B}}", item_b);
    
    // Create the request
    let request = OpenRouterRequest {
        model: model.to_string(),
        messages: vec![
            OpenRouterMessage {
                role: "user".to_string(),
                content: formatted_prompt,
            }
        ],
        temperature: 0.7,
        max_tokens: 5000,
    };
    
    // Make the API call
    let client = reqwest::Client::new();
    let response = client
        .post(OPENROUTER_API_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("HTTP-Referer", "https://sorter.app")
        .header("X-Title", "Sorter App")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API request failed: {}", error_text));
    }
    
    let response_data: OpenRouterResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    // Extract the response content
    let content = response_data
        .choices
        .first()
        .ok_or("No choices in response")?
        .message
        .content
        .clone();
    
    // Parse the score using regex
    let score_regex = Regex::new(r"SCORE:\s*(-?\d+)")
        .map_err(|e| format!("Invalid regex: {}", e))?;
    
    let score = score_regex
        .captures(&content)
        .and_then(|caps| caps.get(1))
        .and_then(|m| m.as_str().parse::<i32>().ok())
        .ok_or_else(|| format!("Could not parse score from response. Full output: {}", content))?;
    
    // Validate score is in range
    let score = score.clamp(-50, 50);
    
    // Extract reasoning (everything except the SCORE line)
    let reasoning = score_regex
        .replace(&content, "")
        .trim()
        .to_string();
    
    Ok((score, reasoning))
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/ws", axum::routing::get(ws_handler))
} 