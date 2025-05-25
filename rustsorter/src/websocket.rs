use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, State},
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::app_state::AppState;

#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum WsCommand {
    CreateJob { prompt: String },
    AddItem { job_id: Uuid, text: String },
    Pause { job_id: Uuid },
    Resume { job_id: Uuid },
    GetStatus { job_id: Uuid },
    ListJobs,
}

#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum WsEvent {
    Connected { user_id: Option<Uuid> },
    JobCreated { job_id: Uuid },
    ItemAdded { job_id: Uuid, item_id: Uuid },
    Vote { job_id: Uuid, a: String, b: String, score: i32 },
    Ranking { job_id: Uuid, items: Vec<ItemScore> },
    JobStatus { job_id: Uuid, status: String },
    Error { message: String },
}

#[derive(Debug, Serialize)]
pub struct ItemScore {
    pub id: Uuid,
    pub text: String,
    pub score: f64,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    
    // Send connected event
    let connected_event = WsEvent::Connected { user_id: None };
    if let Ok(msg) = serde_json::to_string(&connected_event) {
        let _ = sender.send(Message::Text(msg)).await;
    }
    
    // Handle incoming messages
    while let Some(msg) = receiver.next().await {
        if let Ok(Message::Text(text)) = msg {
            match serde_json::from_str::<WsCommand>(&text) {
                Ok(cmd) => {
                    handle_command(cmd, &mut sender, &state).await;
                }
                Err(e) => {
                    let error_event = WsEvent::Error { 
                        message: format!("Invalid command: {}", e) 
                    };
                    if let Ok(msg) = serde_json::to_string(&error_event) {
                        let _ = sender.send(Message::Text(msg)).await;
                    }
                }
            }
        }
    }
}

async fn handle_command(
    cmd: WsCommand,
    sender: &mut futures_util::stream::SplitSink<WebSocket, Message>,
    state: &AppState,
) {
    let response = match cmd {
        WsCommand::CreateJob { prompt } => {
            // TODO: Implement job creation logic
            WsEvent::JobCreated { 
                job_id: Uuid::new_v4() 
            }
        }
        WsCommand::AddItem { job_id, text } => {
            // TODO: Implement item addition logic
            WsEvent::ItemAdded { 
                job_id,
                item_id: Uuid::new_v4() 
            }
        }
        WsCommand::Pause { job_id } => {
            // TODO: Implement pause logic
            WsEvent::JobStatus { 
                job_id,
                status: "paused".to_string() 
            }
        }
        WsCommand::Resume { job_id } => {
            // TODO: Implement resume logic
            WsEvent::JobStatus { 
                job_id,
                status: "running".to_string() 
            }
        }
        WsCommand::GetStatus { job_id } => {
            // TODO: Implement status retrieval
            WsEvent::JobStatus { 
                job_id,
                status: "unknown".to_string() 
            }
        }
        WsCommand::ListJobs => {
            // TODO: Implement job listing
            WsEvent::Error { 
                message: "ListJobs not implemented yet".to_string() 
            }
        }
    };
    
    if let Ok(msg) = serde_json::to_string(&response) {
        let _ = sender.send(Message::Text(msg)).await;
    }
}

pub fn routes() -> axum::Router<AppState> {
    axum::Router::new()
        .route("/ws", axum::routing::get(ws_handler))
} 