use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::app_state::AppState;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};

const DEFAULT_PROMPT: &str = r#"Between A and B, which do you prefer?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

if -50 is strongly prefer A, and 50 is strongly prefer B, then your answer should be a number between -50 and 50.
respond with some reasoning and your score. Your score will be read by this regex: /SCORE: (-?\d+)/"#;

// New data structures for the refactor
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Itemset {
    pub id: Uuid,
    pub title: String,
    pub items: Vec<ItemsetItem>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ItemsetItem {
    pub id: Uuid,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: Uuid,
    pub itemset_id: Uuid,
    pub prompt: String,
    pub model: Option<String>,
    pub status: String,
    pub votes: Vec<Vote>,
    pub rankings: Vec<RankedItem>,
    pub created_at: String,
    pub attribute_slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vote {
    pub item_a_id: Uuid,
    pub item_b_id: Uuid,
    pub score: i32, // -50 to 50, negative favors A, positive favors B
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedItem {
    pub item_id: Uuid,
    pub rank: usize,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ItemsetSummary {
    pub id: Uuid,
    pub title: String,
    pub items: Vec<ItemsetItem>,
    pub created_at: String,
    pub run_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct RunSummary {
    pub id: Uuid,
    pub itemset_id: Uuid,
    pub model: Option<String>,
    pub status: String,
    pub vote_count: usize,
    pub created_at: String,
    pub prompt: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum WsCommand {
    // Itemset commands
    CreateItemset { title: String },
    GetItemset { itemset_id: Uuid },
    ListItemsets,
    AddItemToItemset { itemset_id: Uuid, text: String },
    DeleteItemFromItemset { itemset_id: Uuid, item_id: Uuid },
    
    // Run commands
    CreateRun { itemset_id: Uuid, prompt: String, model: String },
    GetRun { run_id: Uuid },
    ListRuns { itemset_id: Uuid },
    StartRunVoting { run_id: Uuid },
    StopRunVoting { run_id: Uuid },
    
    // Debug command
    GetUniversalVotes,
}

#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum WsEvent {
    // General events
    Connected { user_id: Option<Uuid> },
    Error { message: String },
    
    // Itemset events
    ItemsetCreated { itemset_id: Uuid },
    ItemsetData { itemset: Itemset },
    ItemsetsList { itemsets: Vec<ItemsetSummary> },
    ItemAddedToItemset { itemset_id: Uuid, item_id: Uuid },
    ItemDeletedFromItemset { itemset_id: Uuid, item_id: Uuid },
    
    // Run events
    RunCreated { run_id: Uuid },
    RunData { run: Run, itemset: Itemset },
    RunsList { itemset_id: Uuid, runs: Vec<RunSummary> },
    RunVotingStarted { run_id: Uuid },
    RunVotingStopped { run_id: Uuid },
    VotingCompleted { run_id: Uuid },
    
    // Debug event
    UniversalVotesList { votes: Vec<UniversalVote>, ai_users: HashMap<String, Uuid> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniversalVote {
    pub left_entity_namespace: String,
    pub left_entity_pk: String,
    pub right_entity_namespace: String, 
    pub right_entity_pk: String,
    pub user_id: Uuid,
    pub magnitude: i32,
    pub attribute_slug: String,
    pub created_at: String,
}

// Mock data store
lazy_static::lazy_static! {
    static ref ITEMSETS: Arc<Mutex<HashMap<Uuid, Itemset>>> = Arc::new(Mutex::new({
        let mut itemsets = HashMap::new();
        
        // Add mock itemset for testing
        let itemset1_id = Uuid::new_v4();
        let item1_id = Uuid::new_v4();
        let item2_id = Uuid::new_v4();
        let item3_id = Uuid::new_v4();
        
        let itemset1 = Itemset {
            id: itemset1_id,
            title: "Startup Ideas".to_string(),
            items: vec![
                ItemsetItem {
                    id: item1_id,
                    text: "AI-powered personal nutrition coach that creates meal plans based on your DNA".to_string(),
                },
                ItemsetItem {
                    id: item2_id,
                    text: "Blockchain-based supply chain for verifying organic food authenticity".to_string(),
                },
                ItemsetItem {
                    id: item3_id,
                    text: "VR platform for remote team building and collaboration".to_string(),
                },
            ],
            created_at: chrono::Utc::now().checked_sub_signed(chrono::Duration::hours(3)).unwrap().to_rfc3339(),
        };
        itemsets.insert(itemset1_id, itemset1);
        
        itemsets
    }));
    
    static ref RUNS: Arc<Mutex<HashMap<Uuid, Run>>> = Arc::new(Mutex::new(HashMap::new()));
    
    // Mock AI users - in real system these would be in the database
    static ref AI_USERS: Arc<Mutex<HashMap<String, Uuid>>> = Arc::new(Mutex::new({
        let mut users = HashMap::new();
        // Pre-populate with some common models
        users.insert("openai/gpt-4".to_string(), Uuid::new_v4());
        users.insert("openai/gpt-4o".to_string(), Uuid::new_v4());
        users.insert("anthropic/claude-3-opus".to_string(), Uuid::new_v4());
        users.insert("anthropic/claude-3-sonnet".to_string(), Uuid::new_v4());
        users
    }));
    
    // Mock universal votes table
    static ref UNIVERSAL_VOTES: Arc<Mutex<Vec<UniversalVote>>> = Arc::new(Mutex::new(Vec::new()));
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
    match cmd {
        WsCommand::CreateItemset { title } => {
            let itemset_id = Uuid::new_v4();
            let itemset = Itemset {
                id: itemset_id,
                title,
                items: vec![],
                created_at: chrono::Utc::now().to_rfc3339(),
            };
            
            ITEMSETS.lock().unwrap().insert(itemset_id, itemset);
            
            let _ = tx.send(WsEvent::ItemsetCreated { itemset_id });
        }
        
        WsCommand::GetItemset { itemset_id } => {
            let itemsets = ITEMSETS.lock().unwrap();
            if let Some(itemset) = itemsets.get(&itemset_id) {
                let _ = tx.send(WsEvent::ItemsetData { itemset: itemset.clone() });
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Itemset {} not found", itemset_id) 
                });
            }
        }
        
        WsCommand::ListItemsets => {
            let itemsets = ITEMSETS.lock().unwrap();
            let runs = RUNS.lock().unwrap();
            
            let summaries: Vec<ItemsetSummary> = itemsets.values().map(|itemset| {
                let run_count = runs.values()
                    .filter(|run| run.itemset_id == itemset.id)
                    .count();
                
                ItemsetSummary {
                    id: itemset.id,
                    title: itemset.title.clone(),
                    items: itemset.items.clone(),
                    created_at: itemset.created_at.clone(),
                    run_count,
                }
            }).collect();
            
            let _ = tx.send(WsEvent::ItemsetsList { itemsets: summaries });
        }
        
        WsCommand::AddItemToItemset { itemset_id, text } => {
            let mut itemsets = ITEMSETS.lock().unwrap();
            if let Some(itemset) = itemsets.get_mut(&itemset_id) {
                let item_id = Uuid::new_v4();
                let item = ItemsetItem {
                    id: item_id,
                    text,
                };
                
                itemset.items.push(item);
                
                let _ = tx.send(WsEvent::ItemAddedToItemset { 
                    itemset_id, 
                    item_id,
                });
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Itemset {} not found", itemset_id) 
                });
            }
        }
        
        WsCommand::DeleteItemFromItemset { itemset_id, item_id } => {
            let mut itemsets = ITEMSETS.lock().unwrap();
            if let Some(itemset) = itemsets.get_mut(&itemset_id) {
                itemset.items.retain(|item| item.id != item_id);
                let _ = tx.send(WsEvent::ItemDeletedFromItemset { itemset_id, item_id });
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Itemset {} not found", itemset_id) 
                });
            }
        }
        
        WsCommand::CreateRun { itemset_id, prompt, model } => {
            let itemsets = ITEMSETS.lock().unwrap();
            if let Some(_itemset) = itemsets.get(&itemset_id) {
                let run_id = Uuid::new_v4();
                
                // Generate attribute slug from prompt (first 50 chars, alphanumeric + dashes)
                let attribute_slug = format!("{}-{}", 
                    prompt.chars()
                        .take(50)
                        .map(|c| if c.is_alphanumeric() { c.to_lowercase().to_string() } else { "-".to_string() })
                        .collect::<String>()
                        .trim_matches('-'),
                    chrono::Utc::now().timestamp()
                );
                
                let run = Run {
                    id: run_id,
                    itemset_id,
                    prompt,
                    model: Some(model),
                    status: "created".to_string(),
                    votes: vec![],
                    rankings: vec![],
                    created_at: chrono::Utc::now().to_rfc3339(),
                    attribute_slug,
                };
                
                RUNS.lock().unwrap().insert(run_id, run);
                
                let _ = tx.send(WsEvent::RunCreated { run_id });
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Itemset {} not found", itemset_id) 
                });
            }
        }
        
        WsCommand::GetRun { run_id } => {
            let runs = RUNS.lock().unwrap();
            let itemsets = ITEMSETS.lock().unwrap();
            
            if let Some(run) = runs.get(&run_id) {
                if let Some(itemset) = itemsets.get(&run.itemset_id) {
                    let _ = tx.send(WsEvent::RunData { 
                        run: run.clone(),
                        itemset: itemset.clone()
                    });
                } else {
                    let _ = tx.send(WsEvent::Error { 
                        message: format!("Itemset for run {} not found", run_id) 
                    });
                }
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Run {} not found", run_id) 
                });
            }
        }
        
        WsCommand::ListRuns { itemset_id } => {
            let runs = RUNS.lock().unwrap();
            
            let summaries: Vec<RunSummary> = runs.values()
                .filter(|run| run.itemset_id == itemset_id)
                .map(|run| RunSummary {
                    id: run.id,
                    itemset_id: run.itemset_id,
                    model: run.model.clone(),
                    status: run.status.clone(),
                    vote_count: run.votes.len(),
                    created_at: run.created_at.clone(),
                    prompt: run.prompt.clone(),
                })
                .collect();
            
            let _ = tx.send(WsEvent::RunsList { itemset_id, runs: summaries });
        }
        
        WsCommand::StartRunVoting { run_id } => {
            let mut runs = RUNS.lock().unwrap();
            let itemsets = ITEMSETS.lock().unwrap();
            
            if let Some(run) = runs.get_mut(&run_id) {
                if let Some(itemset) = itemsets.get(&run.itemset_id) {
                    run.status = "voting_in_progress".to_string();
                    let _ = tx.send(WsEvent::RunVotingStarted { run_id });
                    
                    // Start mock voting process
                    if itemset.items.len() >= 2 {
                        let tx_clone = tx.clone();
                        let run_id_copy = run_id;
                        let itemset_items = itemset.items.clone();
                        drop(runs);
                        drop(itemsets);
                        
                        tokio::spawn(async move {
                            sleep(Duration::from_millis(1000)).await;
                            
                            let mut runs = RUNS.lock().unwrap();
                            if let Some(run) = runs.get_mut(&run_id_copy) {
                                // Get or create AI user
                                let mut ai_users = AI_USERS.lock().unwrap();
                                let ai_user_id = ai_users.entry(run.model.clone().unwrap_or_default())
                                    .or_insert_with(Uuid::new_v4)
                                    .clone();
                                drop(ai_users);
                                
                                // Generate all pairwise comparisons
                                let mut votes = Vec::new();
                                let mut rankings = Vec::new();
                                let mut universal_votes = UNIVERSAL_VOTES.lock().unwrap();
                                
                                for i in 0..itemset_items.len() {
                                    for j in (i + 1)..itemset_items.len() {
                                        let score = (rand::random::<f64>() * 100.0 - 50.0) as i32;
                                        
                                        votes.push(Vote {
                                            item_a_id: itemset_items[i].id,
                                            item_b_id: itemset_items[j].id,
                                            score,
                                            reasoning: get_mock_reasoning(&itemset_items[i].text, &itemset_items[j].text, score),
                                        });
                                        
                                        // Store in universal format
                                        // Ensure canonical ordering (smaller ID first)
                                        let (left_item, right_item, final_score) = 
                                            if itemset_items[i].id < itemset_items[j].id {
                                                (&itemset_items[i], &itemset_items[j], -score)
                                            } else {
                                                (&itemset_items[j], &itemset_items[i], score)
                                            };
                                        
                                        universal_votes.push(UniversalVote {
                                            left_entity_namespace: format!("sorter.itemset.{}", run.itemset_id),
                                            left_entity_pk: left_item.id.to_string(),
                                            right_entity_namespace: format!("sorter.itemset.{}", run.itemset_id),
                                            right_entity_pk: right_item.id.to_string(),
                                            user_id: ai_user_id,
                                            magnitude: final_score,
                                            attribute_slug: run.attribute_slug.clone(),
                                            created_at: chrono::Utc::now().to_rfc3339(),
                                        });
                                    }
                                }
                                
                                drop(universal_votes);
                                
                                // Calculate rankings based on votes
                                let mut item_scores: HashMap<Uuid, f64> = HashMap::new();
                                
                                for item in &itemset_items {
                                    let mut total_score = 0.0;
                                    let mut vote_count = 0;
                                    
                                    for vote in &votes {
                                        if vote.item_a_id == item.id {
                                            total_score -= vote.score as f64;
                                            vote_count += 1;
                                        } else if vote.item_b_id == item.id {
                                            total_score += vote.score as f64;
                                            vote_count += 1;
                                        }
                                    }
                                    
                                    let avg_score = if vote_count > 0 {
                                        50.0 + (total_score / vote_count as f64)
                                    } else {
                                        50.0
                                    };
                                    
                                    item_scores.insert(item.id, avg_score);
                                }
                                
                                // Create rankings
                                let mut sorted_items: Vec<_> = item_scores.iter().collect();
                                sorted_items.sort_by(|a, b| b.1.partial_cmp(a.1).unwrap());
                                
                                for (rank, (item_id, score)) in sorted_items.iter().enumerate() {
                                    rankings.push(RankedItem {
                                        item_id: **item_id,
                                        rank: rank + 1,
                                        score: **score,
                                    });
                                }
                                
                                run.votes = votes;
                                run.rankings = rankings;
                                run.status = "completed".to_string();
                                
                                let _ = tx_clone.send(WsEvent::VotingCompleted { run_id: run_id_copy });
                            }
                        });
                    }
                }
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Run {} not found", run_id) 
                });
            }
        }
        
        WsCommand::StopRunVoting { run_id } => {
            let mut runs = RUNS.lock().unwrap();
            if let Some(run) = runs.get_mut(&run_id) {
                run.status = "stopped".to_string();
                let _ = tx.send(WsEvent::RunVotingStopped { run_id });
            }
        }
        
        WsCommand::GetUniversalVotes => {
            let universal_votes = UNIVERSAL_VOTES.lock().unwrap();
            let ai_users = AI_USERS.lock().unwrap();
            
            let _ = tx.send(WsEvent::UniversalVotesList { 
                votes: universal_votes.clone(),
                ai_users: ai_users.clone(),
            });
        }
    }
}

fn get_mock_reasoning(item_a: &str, item_b: &str, score: i32) -> String {
    let reasoning_templates = if score > 20 {
        vec![
            "Significantly stronger concept with broader market appeal and clearer value proposition.",
            "Much more compelling approach with better execution potential and market fit.",
            "Substantially superior in terms of innovation, feasibility, and impact potential.",
            "Far more engaging and well-developed with stronger foundational elements.",
        ]
    } else if score > 5 {
        vec![
            "Slightly better execution with more refined approach and clearer direction.",
            "Marginally stronger with better structure and more compelling presentation.",
            "Somewhat more effective with improved clarity and stronger core concept.",
            "Modestly superior with better development and more convincing arguments.",
        ]
    } else if score > -5 {
        vec![
            "Very close comparison, both have merit but slight edge in presentation quality.",
            "Nearly equivalent options with minimal differences in overall effectiveness.",
            "Comparable approaches with subtle advantages in specific areas.",
            "Similar quality with minor distinctions in execution and clarity.",
        ]
    } else if score > -20 {
        vec![
            "Somewhat weaker approach with less compelling presentation and structure.",
            "Marginally less effective with room for improvement in key areas.",
            "Slightly inferior execution with less refined development and clarity.",
            "Modestly weaker with less convincing arguments and presentation.",
        ]
    } else {
        vec![
            "Significantly less compelling with major gaps in development and execution.",
            "Much weaker concept with limited appeal and unclear value proposition.",
            "Substantially inferior approach with poor execution and market fit.",
            "Far less engaging with fundamental issues in structure and presentation.",
        ]
    };
    
    let template = reasoning_templates[rand::random::<usize>() % reasoning_templates.len()];
    template.to_string()
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/ws", axum::routing::get(ws_handler))
} 