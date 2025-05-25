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

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum WsCommand {
    CreateJob { prompt: String },
    AddItem { job_id: Uuid, text: String },
    Pause { job_id: Uuid },
    Resume { job_id: Uuid },
    GetStatus { job_id: Uuid },
    ListJobs,
    GetJob { job_id: Uuid },
    DeleteItem { job_id: Uuid, item_id: Uuid },
}

#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum WsEvent {
    Connected { user_id: Option<Uuid> },
    JobCreated { job_id: Uuid, prompt: String },
    ItemAdded { job_id: Uuid, item_id: Uuid, item: Item },
    Vote { job_id: Uuid, a: String, b: String, score: i32 },
    Ranking { job_id: Uuid, items: Vec<Item> },
    JobStatus { job_id: Uuid, status: String },
    JobData { job: Job },
    JobsList { jobs: Vec<JobSummary> },
    ItemDeleted { job_id: Uuid, item_id: Uuid },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id: Uuid,
    pub text: String,
    pub score: f64,
    pub explanation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Job {
    pub id: Uuid,
    pub prompt: String,
    pub status: String,
    pub items: Vec<Item>,
    pub created_at: String,
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
    static ref JOBS: Arc<Mutex<HashMap<Uuid, Job>>> = Arc::new(Mutex::new(HashMap::new()));
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
                    explanation: String::new(),
                };
                
                job.items.push(item.clone());
                drop(jobs);
                
                // Send item added event
                let _ = tx.send(WsEvent::ItemAdded { 
                    job_id, 
                    item_id,
                    item,
                });
                
                // Simulate ranking process
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                    sleep(Duration::from_millis(500)).await;
                    
                    let mut jobs = JOBS.lock().unwrap();
                    if let Some(job) = jobs.get_mut(&job_id) {
                        // Mock ranking logic
                        let mut ranked_items = job.items.clone();
                        for (i, item) in ranked_items.iter_mut().enumerate() {
                            item.score = 95.0 - (i as f64 * 8.0) - (rand::random::<f64>() * 5.0);
                            item.explanation = get_mock_explanation(&item.text, i);
                        }
                        ranked_items.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
                        
                        job.items = ranked_items.clone();
                        
                        let _ = tx_clone.send(WsEvent::Ranking { 
                            job_id,
                            items: ranked_items,
                        });
                    }
                });
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
    }
}

fn get_mock_explanation(text: &str, index: usize) -> String {
    let explanations = vec![
        "Clear narrative hook with strong emotional resonance. Establishes stakes immediately.",
        "Personal perspective adds authenticity, but could benefit from broader context.",
        "Strong opening that captures attention. Consider adding more specific details.",
        "Compelling angle with good pacing. Could be more concise in places.",
        "Interesting perspective that challenges assumptions. Missing some key context.",
        "Well-structured argument with clear progression. Some points need elaboration.",
        "Unique voice and perspective. Would benefit from concrete examples.",
        "Engaging narrative flow. Consider strengthening the conclusion.",
    ];
    
    explanations[index % explanations.len()].to_string()
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/ws", axum::routing::get(ws_handler))
} 