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
use chrono::{DateTime, Utc};
use serde_json::{json, Value as JsonValue};

// Namespace constants for sorter entities
pub const PK_NAMESPACE_TAG: &str = "sorter.tag";
pub const PK_NAMESPACE_ITEM: &str = "sorter.item";
pub const PK_NAMESPACE_LENS: &str = "sorter.lens";

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

// ===== DATABASE-ALIGNED CORE DATA STRUCTURES =====

// Tag entity view (maps to entities table with pk_namespace = 'sorter.tag')
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Tag {
    pub id: Uuid,                    // Parsed from entities.pk
    pub user_id: Uuid,               // From entities.user_id
    pub name: String,                // From entities.title
    pub created_at: DateTime<Utc>,   // From entities.created_at
}

// Item entity view (maps to entities table with pk_namespace = 'sorter.item')
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Item {
    pub id: Uuid,                    // Parsed from entities.pk
    pub user_id: Uuid,               // From entities.user_id
    pub tag_id: Uuid,                // From parent relationship
    pub text: String,                // From entities.title or metadata
    pub created_at: DateTime<Utc>,   // From entities.created_at
}

// Lens entity view (maps to entities table with pk_namespace = 'sorter.lens')
// Renamed from Attribute to match the lens concept
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Lens {
    pub id: Uuid,                    // Parsed from entities.pk
    pub user_id: Uuid,               // From entities.user_id
    pub tag_id: Uuid,                // From parent relationship
    pub label: String,               // From entities.title
    pub template: String,            // From entities.metadata.template
    pub created_at: DateTime<Utc>,   // From entities.created_at
}

// Vote struct aligned with new votes table schema
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Vote {
    pub left_entity_pk_namespace: String,   // votes.left_entity_pk_namespace
    pub left_entity_pk: String,             // votes.left_entity_pk (item UUID as string)
    pub right_entity_pk_namespace: String,  // votes.right_entity_pk_namespace
    pub right_entity_pk: String,            // votes.right_entity_pk (item UUID as string)
    pub voter_user_id: Uuid,                // votes.voter_user_id
    pub score: i32,                         // votes.score
    pub lens_entity_pk_namespace: String,   // votes.lens_entity_pk_namespace
    pub lens_entity_pk: String,             // votes.lens_entity_pk (lens UUID as string)
    pub rationale: Option<String>,          // votes.rationale
    pub created_at: DateTime<Utc>,          // votes.created_at
}

// Voter struct (maps to users table where is_ai = true)
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Voter {
    pub id: Uuid,                    // users.id
    pub name: String,                // users.username (model name for AI)
    pub is_ai: bool,                 // users.is_ai
}

// Helper structs for WebSocket responses (keeping these for compatibility)
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
    pub attributes: Vec<Lens>,
    pub voters: Vec<Voter>,
    pub votes: Vec<Vote>,
    pub rankings: Vec<RankedItem>, // Keep for backward compatibility
    pub unvoted_item_count: usize, // Count of items without votes
    pub voters_with_votes: Vec<Uuid>,
    pub selected_attributes: Vec<Uuid>,
    pub selected_voters: Vec<Uuid>,
    pub is_voting_in_progress: bool,
    pub completed_comparisons: Option<usize>,
    pub total_comparisons: Option<usize>,
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
}

// Mock data stores
lazy_static::lazy_static! {
    static ref TAGS: Arc<Mutex<HashMap<Uuid, Tag>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref ITEMS: Arc<Mutex<HashMap<Uuid, Item>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref ATTRIBUTES: Arc<Mutex<HashMap<Uuid, Lens>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref VOTES: Arc<Mutex<Vec<Vote>>> = Arc::new(Mutex::new(Vec::new()));
    static ref VOTERS: Arc<Mutex<HashMap<Uuid, Voter>>> = Arc::new(Mutex::new(HashMap::new()));
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
        max_tokens: Some(5000),
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

// Generate missing comparisons for voting using database queries
async fn generate_missing_comparisons(
    tag_id: Uuid,
    selected_voters: &[Uuid],
    selected_attributes: &[Uuid],
    db: &sqlx::PgPool,
) -> Vec<MissingComparison> {
    // Fetch items for this tag from database
    let items_result = sqlx::query!(
        r#"
        SELECT e.pk, e.user_id, e.title, e.created_at
        FROM entities e
        JOIN entity_relationships er ON e.pk_namespace = er.child_pk_namespace AND e.pk = er.child_pk
        WHERE e.pk_namespace = $1 
        AND er.parent_pk_namespace = $2 AND er.parent_pk = $3
        "#,
        PK_NAMESPACE_ITEM,
        PK_NAMESPACE_TAG,
        tag_id.to_string()
    )
    .fetch_all(db)
    .await;
    
    let items: Vec<Item> = match items_result {
        Ok(rows) => rows.into_iter().filter_map(|row| {
            if let Ok(item_id) = Uuid::parse_str(&row.pk) {
                Some(Item {
                    id: item_id,
                    user_id: row.user_id,
                    tag_id,
                    text: row.title.unwrap_or("Untitled".to_string()),
                    created_at: row.created_at.unwrap_or_else(|| chrono::Utc::now().naive_utc()).and_utc(),
                })
            } else {
                log::warn!("Invalid item UUID: {}", row.pk);
                None
            }
        }).collect(),
        Err(e) => {
            log::error!("Failed to fetch items for missing comparisons: {}", e);
            return Vec::new();
        }
    };
    
    if items.len() < 2 {
        return Vec::new();
    }
    
    // Fetch existing votes for this tag and selected voters/attributes from database
    let votes_result = sqlx::query!(
        r#"
        SELECT v.left_entity_pk, v.right_entity_pk, v.voter_user_id, v.lens_entity_pk
        FROM votes v
        JOIN entity_relationships er ON 
            (v.left_entity_pk = er.child_pk AND v.left_entity_pk_namespace = er.child_pk_namespace)
            OR (v.right_entity_pk = er.child_pk AND v.right_entity_pk_namespace = er.child_pk_namespace)
        WHERE er.parent_pk_namespace = $1 
        AND er.parent_pk = $2
        AND v.voter_user_id = ANY($3)
        AND v.lens_entity_pk = ANY($4)
        "#,
        PK_NAMESPACE_TAG,
        tag_id.to_string(),
        &selected_voters,
        &selected_attributes.iter().map(|id| id.to_string()).collect::<Vec<_>>()
    )
    .fetch_all(db)
    .await;
    
    let existing_votes: HashSet<(Uuid, Uuid, Uuid, Uuid)> = match votes_result {
        Ok(rows) => rows.into_iter().filter_map(|row| {
            // Parse item UUIDs and construct the key
            if let (Ok(item_a_id), Ok(item_b_id), Ok(lens_id)) = (
                Uuid::parse_str(&row.left_entity_pk),
                Uuid::parse_str(&row.right_entity_pk),
                Uuid::parse_str(&row.lens_entity_pk)
            ) {
                Some((row.voter_user_id, lens_id, item_a_id, item_b_id))
            } else {
                log::warn!("Invalid UUID in vote record");
                None
            }
        }).collect(),
        Err(e) => {
            log::error!("Failed to fetch existing votes for missing comparisons: {}", e);
            HashSet::new()
        }
    };
    
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
    session_state_arc: Arc<Mutex<SessionState>>,
    db: &sqlx::PgPool,
) {
    loop {
        let session_action = {
            let mut sessions = VOTING_SESSIONS.lock().unwrap();
            if let Some(session) = sessions.get_mut(&session_id) {
                if session.is_paused {
                    return; // Task will end. ResumeVoting must restart it.
                }

                if session.current_index >= session.comparisons.len() {
                    // Voting complete
                    let tag_id = session.tag_id;
                    sessions.remove(&session_id); // Remove session from global store
                    Some(("complete", tag_id, Vec::new(), Vec::new(), None))
                } else {
                    // Prepare for processing the current comparison
                    let comparison = session.comparisons[session.current_index].clone();
                    Some(("process", session.tag_id, session.voter_ids.clone(), session.attribute_ids.clone(), Some(comparison)))
                }
            } else {
                // Session was removed (e.g., by StopVoting or if it never existed), exit task
                None
            }
        }; // sessions guard is dropped here

        match session_action {
            Some(("complete", tag_id, _, _, _)) => {
                log::info!("Voting session {} completed. Worker terminating.", session_id);
                
                { // Clear voting_session_id from the client's SessionState
                    let mut ss_guard = session_state_arc.lock().unwrap();
                    ss_guard.voting_session_id = None;
                }

                // Send final page state
                let final_page_state = build_tag_detail_page_state(tag_id, &session_state_arc, db).await;
                if tx.send(WsEvent::PageState { state: final_page_state }).is_err() {
                    log::warn!("Client disconnected before final PageState for session {} could be sent.", session_id);
                }
                log::info!("Voting session {} completed.", session_id);
                return; // Voting complete, task ends
            }
            Some(("process", tag_id, voter_ids, attribute_ids, Some(comparison_to_process))) => {
                // Process current comparison
                for voter_id in &voter_ids {
                    for attribute_id_val in &attribute_ids { // Renamed to avoid conflict
                        // Query database for voter and attribute information
                        let voter_result = sqlx::query!(
                            "SELECT username FROM users WHERE id = $1 AND is_ai = true",
                            *voter_id
                        )
                        .fetch_optional(db)
                        .await;
                        
                        let attribute_result = sqlx::query!(
                            "SELECT title, metadata FROM entities WHERE pk_namespace = $1 AND pk = $2",
                            PK_NAMESPACE_LENS,
                            attribute_id_val.to_string()
                        )
                        .fetch_optional(db)
                        .await;
                        
                        let (voter_name, attribute_template) = match (voter_result, attribute_result) {
                            (Ok(Some(voter)), Ok(Some(attribute))) => {
                                let template = attribute.metadata
                                    .as_ref()
                                    .and_then(|meta| meta.get("template"))
                                    .and_then(|t| t.as_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| String::new());
                                
                                (voter.username, template)
                            }
                            _ => {
                                log::error!("Failed to fetch voter {} or attribute {} for voting in session {}", voter_id, attribute_id_val, session_id);
                                continue;
                            }
                        };

                        let prompt = attribute_template
                            .replace("{{A}}", &comparison_to_process.item_a_text)
                            .replace("{{B}}", &comparison_to_process.item_b_text);

                        match call_openrouter_api(&voter_name, &prompt).await {
                            Ok(response) => {
                                if let Some(score) = extract_score_from_response(&response) {
                                    // Ensure left < right ordering for canonical pair
                                    let (left_pk, right_pk, final_score) = if comparison_to_process.item_a_id.to_string() < comparison_to_process.item_b_id.to_string() {
                                        (comparison_to_process.item_a_id.to_string(), comparison_to_process.item_b_id.to_string(), score)
                                    } else {
                                        (comparison_to_process.item_b_id.to_string(), comparison_to_process.item_a_id.to_string(), -score)
                                    };

                                    // Insert vote into database
                                    let insert_result = sqlx::query!(
                                        r#"
                                        INSERT INTO votes (left_entity_pk_namespace, left_entity_pk, right_entity_pk_namespace, right_entity_pk, voter_user_id, score, lens_entity_pk_namespace, lens_entity_pk, rationale, created_at)
                                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
                                        "#,
                                        PK_NAMESPACE_ITEM,
                                        left_pk,
                                        PK_NAMESPACE_ITEM,
                                        right_pk,
                                        *voter_id,
                                        final_score,
                                        PK_NAMESPACE_LENS,
                                        attribute_id_val.to_string(),
                                        response
                                    )
                                    .execute(db)
                                    .await;
                                    
                                    match insert_result {
                                        Ok(_) => {
                                            log::info!("Vote recorded for session {}: ItemA: {}, ItemB: {}, Score: {} by {}", session_id, comparison_to_process.item_a_text, comparison_to_process.item_b_text, final_score, voter_name);
                                        }
                                        Err(e) => {
                                            log::error!("Failed to insert vote for session {}: {}", session_id, e);
                                        }
                                    }
                                } else {
                                    log::warn!("Could not extract score from response for session {}: {}", session_id, response);
                                }
                            }
                            Err(e) => {
                                log::error!("OpenRouter API call failed for session {}: {}", session_id, e);
                            }
                        }
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await; // Delay between API calls
                    }
                }

                // Increment progress AFTER processing the current comparison item
                let session_active_and_updated = {
                    let mut sessions_guard = VOTING_SESSIONS.lock().unwrap();
                    if let Some(session) = sessions_guard.get_mut(&session_id) {
                        if session.is_paused { // Re-check pause, could have been paused during API calls
                            false // Treat as needing to stop for pause
                        } else {
                            session.current_index += 1;
                            log::info!("Session {} progress: {}/{}", session_id, session.current_index, session.total_comparisons);
                            true
                        }
                    } else {
                        false // Session removed during processing
                    }
                };

                if !session_active_and_updated {
                    log::info!("Session {} paused or removed during processing. Worker terminating.", session_id);
                    return; // Exit if paused or removed
                }

                // ALWAYS send updated page state
                let page_state_update = build_tag_detail_page_state(tag_id, &session_state_arc, db).await;
                if tx.send(WsEvent::PageState { state: page_state_update }).is_err() {
                    log::warn!("Client disconnected during voting session {}. Worker terminating.", session_id);
                    // Optionally, consider cleaning up the session from VOTING_SESSIONS if this worker was "owner"
                    // VOTING_SESSIONS.lock().unwrap().remove(&session_id);
                    return;
                }
            }
            None => {
                log::info!("Voting session {} not found or removed. Worker terminating.", session_id);
                return;
            }
            _ => {
                log::warn!("Unexpected session action. Worker terminating.");
                return;
            }
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
            // Fetch tags from database
            let tags = {
                let tags_result = sqlx::query!(
                    r#"
                    SELECT pk, user_id, title, created_at
                    FROM entities 
                    WHERE pk_namespace = $1
                    ORDER BY created_at DESC
                    "#,
                    PK_NAMESPACE_TAG
                )
                .fetch_all(&_state.db)
                .await;
                
                match tags_result {
                    Ok(rows) => rows.into_iter().filter_map(|row| {
                        if let Ok(tag_id) = Uuid::parse_str(&row.pk) {
                            Some(Tag {
                                id: tag_id,
                                user_id: row.user_id,
                                name: row.title.unwrap_or("Untitled".to_string()),
                                created_at: row.created_at.unwrap_or_else(|| chrono::Utc::now().naive_utc()).and_utc(),
                            })
                        } else {
                            log::warn!("Invalid tag UUID: {}", row.pk);
                            None
                        }
                    }).collect(),
                    Err(e) => {
                        log::error!("Failed to fetch tags: {}", e);
                        Vec::new()
                    }
                }
            };
            
            let mut session = session_state.lock().unwrap();
            session.tags_list_state.tags = tags;
            session.current_tag_id = None;
            
            let page_state = PageState::TagsList(session.tags_list_state.clone());
            let _ = tx.send(WsEvent::PageState { state: page_state });
        }
        
        WsCommand::NavigateToTagDetail { tag_id } => {
            let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
            let _ = tx.send(WsEvent::PageState { state: page_state });
        }
        
        WsCommand::CreateTag { name } => {
            if !name.trim().is_empty() {
                let tag_id = Uuid::new_v4();
                
                // Insert tag into entities table
                let insert_result = sqlx::query!(
                    r#"
                    INSERT INTO entities (pk_namespace, pk, user_id, title, created_at)
                    VALUES ($1, $2, $3, $4, now())
                    "#,
                    PK_NAMESPACE_TAG,
                    tag_id.to_string(),
                    _state.spotify_user.id, // Use spotify_user.id instead of generating new UUID
                    name.trim()
                )
                .execute(&_state.db)
                .await;
                
                match insert_result {
                    Ok(_) => {
                        log::info!("Created tag '{}' with ID {}", name.trim(), tag_id);
                        // Navigate to the new tag detail page
                        let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
                        let _ = tx.send(WsEvent::PageState { state: page_state });
                    }
                    Err(e) => {
                        log::error!("Failed to create tag '{}': {}", name.trim(), e);
                        let _ = tx.send(WsEvent::Error { 
                            message: format!("Failed to create tag: {}", e) 
                        });
                    }
                }
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
                let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
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
                let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
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
                    
                    // Insert item into entities table
                    let insert_result = sqlx::query!(
                        r#"
                        INSERT INTO entities (pk_namespace, pk, user_id, title, created_at)
                        VALUES ($1, $2, $3, $4, now())
                        "#,
                        PK_NAMESPACE_ITEM,
                        item_id.to_string(),
                        _state.spotify_user.id, // Use spotify_user.id instead of generating new UUID
                        text.trim()
                    )
                    .execute(&_state.db)
                    .await;
                    
                    match insert_result {
                        Ok(_) => {
                            // Create relationship between item and tag
                            let relationship_result = sqlx::query!(
                                r#"
                                INSERT INTO entity_relationships (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk, user_id)
                                VALUES ($1, $2, $3, $4, $5)
                                "#,
                                PK_NAMESPACE_TAG,
                                tag_id.to_string(),
                                PK_NAMESPACE_ITEM,
                                item_id.to_string(),
                                _state.spotify_user.id
                            )
                            .execute(&_state.db)
                            .await;
                            
                            match relationship_result {
                                Ok(_) => {
                                    log::info!("Created item '{}' with ID {} for tag {}", text.trim(), item_id, tag_id);
                                }
                                Err(e) => {
                                    log::error!("Failed to create item-tag relationship: {}", e);
                                    let _ = tx.send(WsEvent::Error { 
                                        message: format!("Failed to link item to tag: {}", e) 
                                    });
                                    return;
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to create item '{}': {}", text.trim(), e);
                            let _ = tx.send(WsEvent::Error { 
                                message: format!("Failed to create item: {}", e) 
                            });
                            return;
                        }
                    }
                }
                
                let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
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
                    
                    // Insert lens into entities table with template metadata
                    let metadata = json!({
                        "template": template.trim()
                    });
                    
                    let insert_result = sqlx::query!(
                        r#"
                        INSERT INTO entities (pk_namespace, pk, user_id, title, metadata, created_at)
                        VALUES ($1, $2, $3, $4, $5, now())
                        "#,
                        PK_NAMESPACE_LENS,
                        attr_id.to_string(),
                        _state.spotify_user.id, // Use spotify_user.id instead of generating new UUID
                        label.trim(),
                        metadata
                    )
                    .execute(&_state.db)
                    .await;
                    
                    match insert_result {
                        Ok(_) => {
                            // Create relationship between lens and tag
                            let relationship_result = sqlx::query!(
                                r#"
                                INSERT INTO entity_relationships (parent_pk_namespace, parent_pk, child_pk_namespace, child_pk, user_id)
                                VALUES ($1, $2, $3, $4, $5)
                                "#,
                                PK_NAMESPACE_TAG,
                                tag_id.to_string(),
                                PK_NAMESPACE_LENS,
                                attr_id.to_string(),
                                _state.spotify_user.id
                            )
                            .execute(&_state.db)
                            .await;
                            
                            match relationship_result {
                                Ok(_) => {
                                    log::info!("Created lens '{}' with ID {} for tag {}", label.trim(), attr_id, tag_id);
                                }
                                Err(e) => {
                                    log::error!("Failed to create lens-tag relationship: {}", e);
                                    let _ = tx.send(WsEvent::Error { 
                                        message: format!("Failed to link lens to tag: {}", e) 
                                    });
                                    return;
                                }
                            }
                        }
                        Err(e) => {
                            log::error!("Failed to create lens '{}': {}", label.trim(), e);
                            let _ = tx.send(WsEvent::Error { 
                                message: format!("Failed to create lens: {}", e) 
                            });
                            return;
                        }
                    }
                }
                
                let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::CreateOrSelectVoter { name } => {
            if !name.trim().is_empty() {
                let voter_name = name.trim().to_string();
                
                // Check if AI voter already exists in database
                let existing_voter_result = sqlx::query!(
                    r#"
                    SELECT id, username, is_ai
                    FROM users 
                    WHERE username = $1 AND is_ai = true
                    "#,
                    voter_name
                )
                .fetch_optional(&_state.db)
                .await;
                
                let voter_id = match existing_voter_result {
                    Ok(Some(row)) => {
                        log::info!("Found existing AI voter: {}", voter_name);
                        row.id
                    }
                    Ok(None) => {
                        // Create new AI voter
                        let new_voter_id = Uuid::new_v4();
                        let synthetic_auth0_sub = format!("ai_model|{}", voter_name);
                        
                        let insert_result = sqlx::query!(
                            r#"
                            INSERT INTO users (id, auth0_sub, username, is_ai, created_at)
                            VALUES ($1, $2, $3, true, now())
                            RETURNING id
                            "#,
                            new_voter_id,
                            synthetic_auth0_sub,
                            voter_name
                        )
                        .fetch_one(&_state.db)
                        .await;
                        
                        match insert_result {
                            Ok(row) => {
                                log::info!("Created new AI voter: {} with ID {}", voter_name, row.id);
                                row.id
                            }
                            Err(e) => {
                                log::error!("Failed to create AI voter '{}': {}", voter_name, e);
                                let _ = tx.send(WsEvent::Error { 
                                    message: format!("Failed to create voter: {}", e) 
                                });
                                return;
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to check for existing voter '{}': {}", voter_name, e);
                        let _ = tx.send(WsEvent::Error { 
                            message: format!("Failed to check for existing voter: {}", e) 
                        });
                        return;
                    }
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
                    let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
                    let _ = tx.send(WsEvent::PageState { state: page_state });
                }
            }
        }

        WsCommand::DeleteItem { item_id } => {
            // Delete item from database
            let delete_result = sqlx::query!(
                r#"
                DELETE FROM entities 
                WHERE pk_namespace = $1 AND pk = $2
                "#,
                PK_NAMESPACE_ITEM,
                item_id.to_string()
            )
            .execute(&_state.db)
            .await;
            
            match delete_result {
                Ok(result) => {
                    if result.rows_affected() > 0 {
                        log::info!("Deleted item with ID {}", item_id);
                    } else {
                        log::warn!("Item with ID {} not found for deletion", item_id);
                    }
                }
                Err(e) => {
                    log::error!("Failed to delete item {}: {}", item_id, e);
                    let _ = tx.send(WsEvent::Error { 
                        message: format!("Failed to delete item: {}", e) 
                    });
                }
            }
            
            let tag_id = {
                let session = session_state.lock().unwrap();
                session.current_tag_id
            };
            
            if let Some(tag_id) = tag_id {
                let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::DeleteAttribute { attribute_id } => {
            // Delete lens from database
            let delete_result = sqlx::query!(
                r#"
                DELETE FROM entities 
                WHERE pk_namespace = $1 AND pk = $2
                "#,
                PK_NAMESPACE_LENS,
                attribute_id.to_string()
            )
            .execute(&_state.db)
            .await;
            
            match delete_result {
                Ok(result) => {
                    if result.rows_affected() > 0 {
                        log::info!("Deleted lens with ID {}", attribute_id);
                    } else {
                        log::warn!("Lens with ID {} not found for deletion", attribute_id);
                    }
                }
                Err(e) => {
                    log::error!("Failed to delete lens {}: {}", attribute_id, e);
                    let _ = tx.send(WsEvent::Error { 
                        message: format!("Failed to delete lens: {}", e) 
                    });
                }
            }
            
            let tag_id = {
                let session = session_state.lock().unwrap();
                session.current_tag_id
            };
            
            if let Some(tag_id) = tag_id {
                let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
                let _ = tx.send(WsEvent::PageState { state: page_state });
            }
        }
        
        WsCommand::SortMissingPairs => {
            let tag_id_opt = { // Renamed for clarity
                let session = session_state.lock().unwrap();
                session.current_tag_id
            };
            
            if let Some(tag_id) = tag_id_opt {
                let (selected_voters_clone, selected_attributes_clone) = { // Cloned immediately
                    let mut session_guard = session_state.lock().unwrap(); // mut for get_or_create
                    let selection = session_guard.get_or_create_tag_selection(tag_id);
                    (selection.selected_voters.clone(), selection.selected_attributes.clone())
                };
                
                if selected_voters_clone.is_empty() || selected_attributes_clone.is_empty() {
                    let _ = tx.send(WsEvent::Error { 
                        message: "Please select at least one voter and one attribute".to_string() 
                    });
                    return;
                }
                
                let missing_comparisons_vec = generate_missing_comparisons(tag_id, &selected_voters_clone, &selected_attributes_clone, &_state.db).await;
                
                if missing_comparisons_vec.is_empty() {
                    // Send PageState to reflect no comparisons and not in progress
                    let page_state_no_comparisons = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
                     let _ = tx.send(WsEvent::PageState { state: page_state_no_comparisons });
                    let _ = tx.send(WsEvent::Error { 
                        message: "No missing comparisons found".to_string() 
                    });
                    return;
                }
                
                let new_session_id = Uuid::new_v4();
                let voting_session_data = VotingSession {
                    tag_id,
                    voter_ids: selected_voters_clone,
                    attribute_ids: selected_attributes_clone,
                    comparisons: missing_comparisons_vec.clone(),
                    current_index: 0,
                    is_paused: false,
                    total_comparisons: missing_comparisons_vec.len(),
                };
                
                VOTING_SESSIONS.lock().unwrap().insert(new_session_id, voting_session_data);
                
                { // Update client's SessionState with the new voting session ID
                    let mut session_guard = session_state.lock().unwrap();
                    session_guard.voting_session_id = Some(new_session_id);
                }
                
                // Send initial PageState to reflect voting has started
                let initial_page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
                if tx.send(WsEvent::PageState { state: initial_page_state }).is_err() {
                    log::warn!("Client disconnected before voting session {} could fully start.", new_session_id);
                    VOTING_SESSIONS.lock().unwrap().remove(&new_session_id); // Clean up if client gone
                    return;
                }
                
                log::info!("Starting voting session {} for tag {} with {} comparisons.", new_session_id, tag_id, missing_comparisons_vec.len());
                let tx_clone = tx.clone();
                let session_state_clone = session_state.clone();
                let db_clone = _state.db.clone();
                tokio::spawn(async move {
                    process_voting_session(new_session_id, tx_clone, session_state_clone, &db_clone).await;
                });
             }
         }
         
         WsCommand::PauseVoting => {
             let session_id_opt = {
                 let session = session_state.lock().unwrap();
                 session.voting_session_id
             };
             
             if let Some(session_id) = session_id_opt {
                 let was_paused = {
                     let mut sessions = VOTING_SESSIONS.lock().unwrap();
                     if let Some(session) = sessions.get_mut(&session_id) {
                         session.is_paused = true;
                         log::info!("Voting session {} paused", session_id);
                         true
                     } else {
                         log::warn!("Voting session {} not found for pausing.", session_id);
                         false
                     }
                 }; // sessions guard dropped here

                 if was_paused {
                     // Send updated PageState to reflect pause
                     let tag_id_for_state = session_state.lock().unwrap().current_tag_id;
                     if let Some(tid) = tag_id_for_state {
                        let paused_page_state = build_tag_detail_page_state(tid, &session_state, &_state.db).await;
                        let _ = tx.send(WsEvent::PageState { state: paused_page_state });
                     }
                 }
             } else {
                log::info!("No active voting session to pause.");
             }
         }
         
         WsCommand::ResumeVoting => {
             let session_id_opt = {
                 let session = session_state.lock().unwrap();
                 session.voting_session_id
             };
             
             if let Some(session_id) = session_id_opt {
                 let should_respawn = {
                    let mut sessions = VOTING_SESSIONS.lock().unwrap();
                    if let Some(session) = sessions.get_mut(&session_id) {
                        if session.is_paused {
                            session.is_paused = false;
                            log::info!("Voting session {} resumed", session_id);
                            true // Indicate that respawning is needed
                        } else {
                            log::info!("Voting session {} was not paused. No action taken for resume.", session_id);
                            false
                        }
                    } else {
                        log::warn!("Voting session {} not found for resume.", session_id);
                        false
                    }
                 }; // sessions lock released here

                 if should_respawn {
                    // Send PageState to reflect resumption and current progress
                    let tag_id_for_state = session_state.lock().unwrap().current_tag_id;
                    if let Some(tid) = tag_id_for_state {
                       let resumed_page_state = build_tag_detail_page_state(tid, &session_state, &_state.db).await;
                       if tx.send(WsEvent::PageState { state: resumed_page_state }).is_err() {
                            log::warn!("Client disconnected on resume for session {}. Not respawning worker.", session_id);
                            // Session remains unpaused in VOTING_SESSIONS but worker won't run for this client.
                            // Consider if session should be re-paused or handled differently.
                            return;
                       }
                    } else {
                        log::warn!("No current_tag_id in session_state on resume for session {}, cannot send PageState or respawn.", session_id);
                        return; // Cannot proceed without tag_id
                    }
                    
                    // RESPAWN THE TASK
                    log::info!("Respawning worker for resumed voting session {}", session_id);
                    let tx_clone = tx.clone();
                    let session_state_clone = session_state.clone();
                    let db_clone = _state.db.clone();
                    tokio::spawn(async move {
                        process_voting_session(session_id, tx_clone, session_state_clone, &db_clone).await;
                    });
                 }
             } else {
                 log::info!("No active voting session to resume or session not found/not paused.");
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
                     let page_state = build_tag_detail_page_state(tag_id, &session_state, &_state.db).await;
                     let _ = tx.send(WsEvent::PageState { state: page_state });
                 }
             }
         }
    }
}

async fn build_tag_detail_page_state(
    tag_id: Uuid,
    session_state_arc: &Arc<Mutex<SessionState>>,
    db: &sqlx::PgPool,
) -> PageState {
    // Update session to track current tag (mut lock needed)
    session_state_arc.lock().unwrap().current_tag_id = Some(tag_id);
    
    // Fetch tag from database
    let tag = {
        let tag_result = sqlx::query!(
            r#"
            SELECT pk, user_id, title, created_at
            FROM entities 
            WHERE pk_namespace = $1 AND pk = $2
            "#,
            PK_NAMESPACE_TAG,
            tag_id.to_string()
        )
        .fetch_optional(db)
        .await;
        
        match tag_result {
            Ok(Some(row)) => Tag {
                id: tag_id,
                user_id: row.user_id,
                name: row.title.unwrap_or("Untitled".to_string()),
                created_at: row.created_at.unwrap_or_else(|| chrono::Utc::now().naive_utc()).and_utc(),
            },
            _ => {
                log::warn!("Tag {} not found in database, using fallback", tag_id);
                Tag {
                    id: tag_id,
                    user_id: Uuid::new_v4(),
                    name: "Unknown".to_string(),
                    created_at: chrono::Utc::now(),
                }
            }
        }
    };
    
    // Fetch items for this tag from database
    let items: Vec<Item> = {
        let items_result = sqlx::query!(
            r#"
            SELECT e.pk, e.user_id, e.title, e.created_at
            FROM entities e
            JOIN entity_relationships er ON e.pk_namespace = er.child_pk_namespace AND e.pk = er.child_pk
            WHERE e.pk_namespace = $1 
            AND er.parent_pk_namespace = $2 AND er.parent_pk = $3
            "#,
            PK_NAMESPACE_ITEM,
            PK_NAMESPACE_TAG,
            tag_id.to_string()
        )
        .fetch_all(db)
        .await;
        
        match items_result {
            Ok(rows) => rows.into_iter().filter_map(|row| {
                if let Ok(item_id) = Uuid::parse_str(&row.pk) {
                    Some(Item {
                        id: item_id,
                        user_id: row.user_id,
                        tag_id,
                        text: row.title.unwrap_or("Untitled".to_string()),
                        created_at: row.created_at.unwrap_or_else(|| chrono::Utc::now().naive_utc()).and_utc(),
                    })
                } else {
                    log::warn!("Invalid item UUID: {}", row.pk);
                    None
                }
            }).collect(),
            Err(e) => {
                log::error!("Failed to fetch items for tag {}: {}", tag_id, e);
                Vec::new()
            }
        }
    };
    
    // Fetch lenses (attributes) for this tag from database
    let attributes: Vec<Lens> = {
        let lenses_result = sqlx::query!(
            r#"
            SELECT e.pk, e.user_id, e.title, e.metadata, e.created_at
            FROM entities e
            JOIN entity_relationships er ON e.pk_namespace = er.child_pk_namespace AND e.pk = er.child_pk
            WHERE e.pk_namespace = $1 
            AND er.parent_pk_namespace = $2 AND er.parent_pk = $3
            "#,
            PK_NAMESPACE_LENS,
            PK_NAMESPACE_TAG,
            tag_id.to_string()
        )
        .fetch_all(db)
        .await;
        
        match lenses_result {
            Ok(rows) => rows.into_iter().filter_map(|row| {
                if let Ok(lens_id) = Uuid::parse_str(&row.pk) {
                    let template = match row.metadata {
                        Some(meta) => {
                            meta.get("template")
                                .and_then(|t| t.as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| String::new())
                        }
                        None => String::new(),
                    };
                    
                    Some(Lens {
                        id: lens_id,
                        user_id: row.user_id,
                        tag_id,
                        label: row.title.unwrap_or("Untitled".to_string()),
                        template,
                        created_at: row.created_at.unwrap_or_else(|| chrono::Utc::now().naive_utc()).and_utc(),
                    })
                } else {
                    log::warn!("Invalid lens UUID: {}", row.pk);
                    None
                }
            }).collect(),
            Err(e) => {
                log::error!("Failed to fetch lenses for tag {}: {}", tag_id, e);
                Vec::new()
            }
        }
    };
    
    // Fetch all AI voters from database
    let voters: Vec<Voter> = {
        let voters_result = sqlx::query!(
            r#"
            SELECT id, username, is_ai
            FROM users 
            WHERE is_ai = true
            ORDER BY username
            "#
        )
        .fetch_all(db)
        .await;
        
        match voters_result {
            Ok(rows) => rows.into_iter().map(|row| Voter {
                id: row.id,
                name: row.username,
                is_ai: row.is_ai,
            }).collect(),
            Err(e) => {
                log::error!("Failed to fetch voters: {}", e);
                Vec::new()
            }
        }
    };
    
    // Fetch all votes for this tag from database
    let votes_result = sqlx::query_as!(
        Vote,
        r#"
        SELECT DISTINCT v.left_entity_pk_namespace, v.left_entity_pk, v.right_entity_pk_namespace, v.right_entity_pk, 
               v.voter_user_id, v.score, v.lens_entity_pk_namespace, v.lens_entity_pk, 
               v.rationale, v.created_at
        FROM votes v
        JOIN entity_relationships er ON 
            (v.left_entity_pk = er.child_pk AND v.left_entity_pk_namespace = er.child_pk_namespace)
            OR (v.right_entity_pk = er.child_pk AND v.right_entity_pk_namespace = er.child_pk_namespace)
        WHERE er.parent_pk_namespace = $1 
        AND er.parent_pk = $2
        ORDER BY v.created_at DESC
        "#,
        PK_NAMESPACE_TAG,
        tag_id.to_string()
    )
    .fetch_all(db)
    .await;
    
    let votes: Vec<Vote> = match votes_result {
        Ok(votes) => votes,
        Err(e) => {
            log::error!("Failed to fetch votes for tag {}: {}", tag_id, e);
            Vec::new()
        }
    };
    
    // Get selected state, voting status, and progress info (keeping session state logic)
    let (
        current_selected_voters,
        current_selected_attributes,
        current_is_voting_in_progress,
        current_completed_comparisons,
        current_total_comparisons,
    ) = {
        let mut ss_guard = session_state_arc.lock().unwrap();
        let selection_state = ss_guard.get_or_create_tag_selection(tag_id);
        let sel_voters_clone = selection_state.selected_voters.clone();
        let sel_attributes_clone = selection_state.selected_attributes.clone();
        let voting_session_id_opt = ss_guard.voting_session_id;
        drop(ss_guard);

        if let Some(active_session_id) = voting_session_id_opt {
            let sessions_guard = VOTING_SESSIONS.lock().unwrap();
            if let Some(session_data) = sessions_guard.get(&active_session_id) {
                if session_data.tag_id == tag_id {
                     (
                        sel_voters_clone,
                        sel_attributes_clone,
                        !session_data.is_paused,
                        Some(session_data.current_index),
                        Some(session_data.total_comparisons),
                    )
                } else {
                    log::warn!("Active session {} in SessionState is for tag {}, but current tag is {}.", active_session_id, session_data.tag_id, tag_id);
                    (sel_voters_clone, sel_attributes_clone, false, None, None)
                }
            } else {
                session_state_arc.lock().unwrap().voting_session_id = None;
                (sel_voters_clone, sel_attributes_clone, false, None, None)
            }
        } else {
            (sel_voters_clone, sel_attributes_clone, false, None, None)
        }
    };
    
    // Filter votes by selected voters and attributes
    let filtered_votes_list: Vec<Vote> = votes
        .iter()
        .filter(|vote| {
            let voter_match = if current_selected_voters.is_empty() {
                true
            } else {
                current_selected_voters.contains(&vote.voter_user_id)
            };
            
            let attribute_match = if current_selected_attributes.is_empty() {
                true
            } else {
                if let Ok(vote_lens_id) = Uuid::parse_str(&vote.lens_entity_pk) {
                    current_selected_attributes.contains(&vote_lens_id)
                } else {
                    false
                }
            };
            
            voter_match && attribute_match
        })
        .cloned()
        .collect();
    
    // Calculate voters_with_votes from ALL votes for the tag
    let voters_with_all_votes = calculate_voters_with_votes(&votes);
    let current_rankings = calculate_rankings(&items, &filtered_votes_list);
    
    let voted_item_ids_from_filtered: HashSet<Uuid> = filtered_votes_list
        .iter()
        .filter_map(|vote| {
            let left_item = Uuid::parse_str(&vote.left_entity_pk).ok();
            let right_item = Uuid::parse_str(&vote.right_entity_pk).ok();
            match (left_item, right_item) {
                (Some(left), Some(right)) => Some(vec![left, right]),
                _ => None,
            }
        })
        .flatten()
        .collect();
    
    let current_unsorted_items: Vec<Item> = items
        .iter()
        .filter(|item| !voted_item_ids_from_filtered.contains(&item.id))
        .cloned()
        .collect();
    
    let current_unvoted_item_count = current_unsorted_items.len();
    
    let state = TagDetailPageState {
        tag,
        sorted_items: current_rankings.clone(),
        unsorted_items: current_unsorted_items,
        attributes,
        voters,
        votes: filtered_votes_list.clone(),
        rankings: current_rankings,
        unvoted_item_count: current_unvoted_item_count,
        voters_with_votes: voters_with_all_votes,
        selected_attributes: current_selected_attributes,
        selected_voters: current_selected_voters,
        is_voting_in_progress: current_is_voting_in_progress,
        completed_comparisons: current_completed_comparisons,
        total_comparisons: current_total_comparisons,
    };
    
    PageState::TagDetail(state)
}

fn calculate_voters_with_votes(votes: &[Vote]) -> Vec<Uuid> {
    let mut voter_ids: HashSet<Uuid> = HashSet::new();
    for vote in votes {
        voter_ids.insert(vote.voter_user_id);
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
        .filter_map(|vote| {
            // Parse item UUIDs from the new string fields
            let left_item = Uuid::parse_str(&vote.left_entity_pk).ok();
            let right_item = Uuid::parse_str(&vote.right_entity_pk).ok();
            match (left_item, right_item) {
                (Some(left), Some(right)) => Some(vec![left, right]),
                _ => None,
            }
        })
        .flatten()
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
        .filter_map(|vote| {
            // Parse item UUIDs from string fields
            match (Uuid::parse_str(&vote.left_entity_pk), Uuid::parse_str(&vote.right_entity_pk)) {
                (Ok(left_id), Ok(right_id)) => Some(RelevantVote {
                    left_entity_pk_namespace: "item".to_string(),
                    left_entity_pk: left_id.to_string(),
                    right_entity_pk_namespace: "item".to_string(),
                    right_entity_pk: right_id.to_string(),
                    magnitude: vote.score,
                }),
                _ => None,
            }
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