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
use rand::seq::SliceRandom;

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
    // Legacy job commands (kept for compatibility)
    CreateJob { prompt: String },
    AddItem { job_id: Uuid, text: String },
    Pause { job_id: Uuid },
    Resume { job_id: Uuid },
    GetStatus { job_id: Uuid },
    GetJob { job_id: Uuid },
    ListJobs,
    DeleteItem { job_id: Uuid, item_id: Uuid },
    SetModel { job_id: Uuid, model: String },
    StartVoting { job_id: Uuid },
    StopVoting { job_id: Uuid },
    
    // New itemset commands
    CreateItemset { title: String },
    GetItemset { itemset_id: Uuid },
    ListItemsets,
    AddItemToItemset { itemset_id: Uuid, text: String },
    DeleteItemFromItemset { itemset_id: Uuid, item_id: Uuid },
    
    // New run commands
    CreateRun { itemset_id: Uuid, prompt: String, model: String },
    GetRun { run_id: Uuid },
    ListRuns { itemset_id: Uuid },
    StartRunVoting { run_id: Uuid },
    StopRunVoting { run_id: Uuid },
}

#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum WsEvent {
    // Legacy events
    Connected { user_id: Option<Uuid> },
    JobCreated { job_id: Uuid, prompt: String },
    ItemAdded { job_id: Uuid, item_id: Uuid, item: Item },
    Vote { job_id: Uuid, a: String, b: String, score: i32 },
    Ranking { job_id: Uuid, items: Vec<Item> },
    JobStatus { job_id: Uuid, status: String },
    JobData { job: Job },
    JobsList { jobs: Vec<JobSummary> },
    ItemDeleted { job_id: Uuid, item_id: Uuid },
    ModelSet { job_id: Uuid, model: String },
    VotingStarted { job_id: Uuid },
    VotingStopped { job_id: Uuid },
    VotingProgress { job_id: Uuid, completed: usize, total: usize },
    Error { message: String },
    
    // New itemset events
    ItemsetCreated { itemset_id: Uuid },
    ItemsetData { itemset: Itemset },
    ItemsetsList { itemsets: Vec<ItemsetSummary> },
    ItemAddedToItemset { itemset_id: Uuid, item_id: Uuid },
    ItemDeletedFromItemset { itemset_id: Uuid, item_id: Uuid },
    
    // New run events
    RunCreated { run_id: Uuid },
    RunData { run: Run, itemset: Itemset },
    RunsList { itemset_id: Uuid, runs: Vec<RunSummary> },
    RunVotingStarted { run_id: Uuid },
    RunVotingStopped { run_id: Uuid },
    VotingCompleted { run_id: Uuid },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoteRecord {
    pub against_item_id: Uuid,
    pub against_item_text: String,
    pub score: i32,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id: Uuid,
    pub text: String,
    pub score: f64,
    pub votes: Vec<VoteRecord>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Job {
    pub id: Uuid,
    pub prompt: String,
    pub status: String,
    pub items: Vec<Item>,
    pub created_at: String,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobSummary {
    pub id: Uuid,
    pub prompt: String,
    pub status: String,
    pub item_count: usize,
    pub created_at: String,
}

// Mock data store
lazy_static::lazy_static! {
    static ref JOBS: Arc<Mutex<HashMap<Uuid, Job>>> = Arc::new(Mutex::new({
        let mut jobs = HashMap::new();
        
        // Add some mock jobs for testing
        let job1_id = Uuid::new_v4();
        let item1_id = Uuid::new_v4();
        let item2_id = Uuid::new_v4();
        let item3_id = Uuid::new_v4();
        
        let job1 = Job {
            id: job1_id,
            prompt: "Which startup idea is more compelling?\n\nConsider market size, feasibility, and potential impact.".to_string(),
            status: "active".to_string(),
            items: vec![
                Item {
                    id: item1_id,
                    text: "AI-powered personal nutrition coach that creates meal plans based on your DNA".to_string(),
                    score: 92.5,
                    votes: vec![
                        VoteRecord {
                            against_item_id: item2_id,
                            against_item_text: "Blockchain-based supply chain for verifying organic food authenticity".to_string(),
                            score: 15,
                            reasoning: "DNA-based nutrition has broader market appeal and more immediate consumer value than blockchain supply chain verification.".to_string(),
                        },
                        VoteRecord {
                            against_item_id: item3_id,
                            against_item_text: "VR platform for remote team building and collaboration".to_string(),
                            score: 8,
                            reasoning: "Both address growing markets, but nutrition coaching has lower technical barriers and faster path to market.".to_string(),
                        },
                    ],
                },
                Item {
                    id: item2_id,
                    text: "Blockchain-based supply chain for verifying organic food authenticity".to_string(),
                    score: 78.3,
                    votes: vec![
                        VoteRecord {
                            against_item_id: item1_id,
                            against_item_text: "AI-powered personal nutrition coach that creates meal plans based on your DNA".to_string(),
                            score: -15,
                            reasoning: "While blockchain verification addresses real trust issues, the DNA nutrition coach has broader consumer appeal and simpler implementation.".to_string(),
                        },
                        VoteRecord {
                            against_item_id: item3_id,
                            against_item_text: "VR platform for remote team building and collaboration".to_string(),
                            score: -5,
                            reasoning: "VR collaboration has more immediate market demand post-pandemic, though blockchain verification has long-term potential.".to_string(),
                        },
                    ],
                },
                Item {
                    id: item3_id,
                    text: "VR platform for remote team building and collaboration".to_string(),
                    score: 85.7,
                    votes: vec![
                        VoteRecord {
                            against_item_id: item1_id,
                            against_item_text: "AI-powered personal nutrition coach that creates meal plans based on your DNA".to_string(),
                            score: -8,
                            reasoning: "VR collaboration addresses immediate remote work needs, but nutrition coaching has broader long-term market potential.".to_string(),
                        },
                        VoteRecord {
                            against_item_id: item2_id,
                            against_item_text: "Blockchain-based supply chain for verifying organic food authenticity".to_string(),
                            score: 5,
                            reasoning: "VR has more immediate market traction with remote work trends compared to blockchain supply chain adoption barriers.".to_string(),
                        },
                    ],
                },
            ],
            created_at: chrono::Utc::now().checked_sub_signed(chrono::Duration::hours(2)).unwrap().to_rfc3339(),
            model: None,
        };
        jobs.insert(job1_id, job1);
        
        let job2_id = Uuid::new_v4();
        let item4_id = Uuid::new_v4();
        let item5_id = Uuid::new_v4();
        
        let job2 = Job {
            id: job2_id,
            prompt: DEFAULT_PROMPT.to_string(),
            status: "paused".to_string(),
            items: vec![
                Item {
                    id: item4_id,
                    text: "The quick brown fox jumps over the lazy dog".to_string(),
                    score: 65.0,
                    votes: vec![
                        VoteRecord {
                            against_item_id: item5_id,
                            against_item_text: "To be or not to be, that is the question".to_string(),
                            score: -23,
                            reasoning: "Shakespeare's philosophical depth and cultural impact far exceeds a simple pangram demonstration.".to_string(),
                        },
                    ],
                },
                Item {
                    id: item5_id,
                    text: "To be or not to be, that is the question".to_string(),
                    score: 88.0,
                    votes: vec![
                        VoteRecord {
                            against_item_id: item4_id,
                            against_item_text: "The quick brown fox jumps over the lazy dog".to_string(),
                            score: 23,
                            reasoning: "Hamlet's existential question represents profound philosophical inquiry versus a functional but mundane pangram.".to_string(),
                        },
                    ],
                },
            ],
            created_at: chrono::Utc::now().checked_sub_signed(chrono::Duration::days(1)).unwrap().to_rfc3339(),
            model: None,
        };
        jobs.insert(job2_id, job2);
        
        jobs
    }));
    
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
        WsCommand::CreateJob { prompt } => {
            let job_id = Uuid::new_v4();
            let job = Job {
                id: job_id,
                prompt: prompt.clone(),
                status: "active".to_string(),
                items: vec![],
                created_at: chrono::Utc::now().to_rfc3339(),
                model: None,
            };
            
            JOBS.lock().unwrap().insert(job_id, job);
            
            let _ = tx.send(WsEvent::JobCreated { job_id, prompt });
        }
        
        WsCommand::AddItem { job_id, text } => {
            let mut jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get_mut(&job_id) {
                let item_id = Uuid::new_v4();
                let item = Item {
                    id: item_id,
                    text: text.clone(),
                    score: 0.0,
                    votes: vec![],
                };
                
                job.items.push(item.clone());
                
                // Send item added event
                let _ = tx.send(WsEvent::ItemAdded { 
                    job_id, 
                    item_id,
                    item,
                });
                
                // Only trigger ranking if voting is active
                if job.status == "voting_started" {
                    let tx_clone = tx.clone();
                    let job_items = job.items.clone();
                    drop(jobs);
                    
                    tokio::spawn(async move {
                        sleep(Duration::from_millis(500)).await;
                        
                        let mut jobs = JOBS.lock().unwrap();
                        if let Some(job) = jobs.get_mut(&job_id) {
                            // Mock ranking logic with pairwise comparisons
                            let mut ranked_items = job_items;
                            let new_item_index = ranked_items.len() - 1;
                            
                            // Generate mock votes for the new item against existing items
                            if ranked_items.len() > 1 {
                                let new_item_id = ranked_items[new_item_index].id;
                                let new_item_text = ranked_items[new_item_index].text.clone();
                                
                                // Collect existing item data to avoid borrowing conflicts
                                let existing_items_data: Vec<(usize, Uuid, String)> = ranked_items.iter()
                                    .enumerate()
                                    .filter(|(i, _)| *i != new_item_index)
                                    .map(|(i, item)| (i, item.id, item.text.clone()))
                                    .collect();
                                
                                for (i, existing_item_id, existing_item_text) in existing_items_data {
                                    // Generate a random comparison score
                                    let score = (rand::random::<f64>() * 100.0 - 50.0) as i32;
                                    let reasoning = get_mock_reasoning(&new_item_text, &existing_item_text, score);
                                    
                                    // Add vote to new item
                                    ranked_items[new_item_index].votes.push(VoteRecord {
                                        against_item_id: existing_item_id,
                                        against_item_text: existing_item_text.clone(),
                                        score,
                                        reasoning: reasoning.clone(),
                                    });
                                    
                                    // Add reciprocal vote to existing item
                                    ranked_items[i].votes.push(VoteRecord {
                                        against_item_id: new_item_id,
                                        against_item_text: new_item_text.clone(),
                                        score: -score,
                                        reasoning: get_mock_reasoning(&existing_item_text, &new_item_text, -score),
                                    });
                                }
                            }
                            
                            // Calculate scores based on vote averages
                            for item in ranked_items.iter_mut() {
                                if !item.votes.is_empty() {
                                    let avg_score: f64 = item.votes.iter().map(|v| v.score as f64).sum::<f64>() / item.votes.len() as f64;
                                    item.score = 50.0 + avg_score; // Normalize to 0-100 range
                                } else {
                                    item.score = 50.0; // Default score for items with no votes
                                }
                            }
                            
                            // Sort by score
                            ranked_items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
                            
                            job.items = ranked_items.clone();
                            
                            let _ = tx_clone.send(WsEvent::Ranking { 
                                job_id,
                                items: ranked_items,
                            });
                        }
                    });
                }
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Job {} not found", job_id) 
                });
            }
        }
        
        WsCommand::DeleteItem { job_id, item_id } => {
            let mut jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get_mut(&job_id) {
                job.items.retain(|item| item.id != item_id);
                let _ = tx.send(WsEvent::ItemDeleted { job_id, item_id });
                
                // Re-rank remaining items
                let ranked_items = job.items.clone();
                let _ = tx.send(WsEvent::Ranking { 
                    job_id,
                    items: ranked_items,
                });
            }
        }
        
        WsCommand::GetJob { job_id } => {
            let jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get(&job_id) {
                let _ = tx.send(WsEvent::JobData { job: job.clone() });
            } else {
                let _ = tx.send(WsEvent::Error { 
                    message: format!("Job {} not found", job_id) 
                });
            }
        }
        
        WsCommand::Pause { job_id } => {
            let mut jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get_mut(&job_id) {
                job.status = "paused".to_string();
                let _ = tx.send(WsEvent::JobStatus { 
                    job_id,
                    status: "paused".to_string() 
                });
            }
        }
        
        WsCommand::Resume { job_id } => {
            let mut jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get_mut(&job_id) {
                job.status = "active".to_string();
                let _ = tx.send(WsEvent::JobStatus { 
                    job_id,
                    status: "active".to_string() 
                });
            }
        }
        
        WsCommand::GetStatus { job_id } => {
            let jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get(&job_id) {
                let _ = tx.send(WsEvent::JobStatus { 
                    job_id,
                    status: job.status.clone() 
                });
            }
        }
        
        WsCommand::ListJobs => {
            let jobs = JOBS.lock().unwrap();
            let summaries: Vec<JobSummary> = jobs.values().map(|job| JobSummary {
                id: job.id,
                prompt: job.prompt.clone(),
                status: job.status.clone(),
                item_count: job.items.len(),
                created_at: job.created_at.clone(),
            }).collect();
            
            let _ = tx.send(WsEvent::JobsList { jobs: summaries });
        }
        
        WsCommand::SetModel { job_id, model } => {
            let mut jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get_mut(&job_id) {
                job.status = "model_selected".to_string();
                job.model = Some(model.clone());
                let _ = tx.send(WsEvent::ModelSet { job_id, model });
            }
        }
        
        WsCommand::StartVoting { job_id } => {
            let mut jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get_mut(&job_id) {
                job.status = "voting_started".to_string();
                let _ = tx.send(WsEvent::VotingStarted { job_id });
                
                // Trigger full ranking of all items
                if job.items.len() >= 2 {
                    let tx_clone = tx.clone();
                    let job_items = job.items.clone();
                    drop(jobs);
                    
                    tokio::spawn(async move {
                        sleep(Duration::from_millis(1000)).await;
                        
                        let mut jobs = JOBS.lock().unwrap();
                        if let Some(job) = jobs.get_mut(&job_id) {
                            let mut ranked_items = job_items;
                            
                            // Clear existing votes and regenerate all pairwise comparisons
                            for item in ranked_items.iter_mut() {
                                item.votes.clear();
                            }
                            
                            // Generate all pairwise comparisons
                            for i in 0..ranked_items.len() {
                                for j in (i + 1)..ranked_items.len() {
                                    let score = (rand::random::<f64>() * 100.0 - 50.0) as i32;
                                    
                                    let item_a_text = ranked_items[i].text.clone();
                                    let item_b_text = ranked_items[j].text.clone();
                                    let item_a_id = ranked_items[i].id;
                                    let item_b_id = ranked_items[j].id;
                                    
                                    // Add vote to item A
                                    ranked_items[i].votes.push(VoteRecord {
                                        against_item_id: item_b_id,
                                        against_item_text: item_b_text.clone(),
                                        score,
                                        reasoning: get_mock_reasoning(&item_a_text, &item_b_text, score),
                                    });
                                    
                                    // Add reciprocal vote to item B
                                    ranked_items[j].votes.push(VoteRecord {
                                        against_item_id: item_a_id,
                                        against_item_text: item_a_text.clone(),
                                        score: -score,
                                        reasoning: get_mock_reasoning(&item_b_text, &item_a_text, -score),
                                    });
                                }
                            }
                            
                            // Calculate scores based on vote averages
                            for item in ranked_items.iter_mut() {
                                if !item.votes.is_empty() {
                                    let avg_score: f64 = item.votes.iter().map(|v| v.score as f64).sum::<f64>() / item.votes.len() as f64;
                                    item.score = 50.0 + avg_score; // Normalize to 0-100 range
                                } else {
                                    item.score = 50.0; // Default score for items with no votes
                                }
                            }
                            
                            // Sort by score
                            ranked_items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
                            
                            job.items = ranked_items.clone();
                            
                            let _ = tx_clone.send(WsEvent::Ranking { 
                                job_id,
                                items: ranked_items,
                            });
                        }
                    });
                }
            }
        }
        
        WsCommand::StopVoting { job_id } => {
            let mut jobs = JOBS.lock().unwrap();
            if let Some(job) = jobs.get_mut(&job_id) {
                job.status = "voting_stopped".to_string();
                let _ = tx.send(WsEvent::VotingStopped { job_id });
            }
        }
        
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
                let run = Run {
                    id: run_id,
                    itemset_id,
                    prompt,
                    model: Some(model),
                    status: "created".to_string(),
                    votes: vec![],
                    rankings: vec![],
                    created_at: chrono::Utc::now().to_rfc3339(),
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
                                // Generate all pairwise comparisons
                                let mut votes = Vec::new();
                                let mut rankings = Vec::new();
                                
                                for i in 0..itemset_items.len() {
                                    for j in (i + 1)..itemset_items.len() {
                                        let score = (rand::random::<f64>() * 100.0 - 50.0) as i32;
                                        
                                        votes.push(Vote {
                                            item_a_id: itemset_items[i].id,
                                            item_b_id: itemset_items[j].id,
                                            score,
                                            reasoning: get_mock_reasoning(&itemset_items[i].text, &itemset_items[j].text, score),
                                        });
                                    }
                                }
                                
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