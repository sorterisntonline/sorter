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
    entity,
    entity_relationships,
    integrations::reddit::{RedditPost, RedditComment},
};

#[derive(Deserialize, Serialize, JsonSchema, Debug, Clone)]
#[serde(tag = "type", content = "data")]
pub enum ClientCommand {
    UpdateQuery { query: String },
    Vote { item_a_id: String, item_b_id: String, preference: VotePreference },
    NavigateToEntity { entity_id: String },
    FetchVotingPairs { context: String },
    ExecuteRedditImport(RedditImport),
    Ping,
}

#[derive(Deserialize, Serialize, JsonSchema, Debug, Clone)]
#[serde(tag = "source", rename_all = "snake_case")]
pub enum RedditImport {
    // Import hot posts for a subreddit
    SubredditHot { subreddit: String, limit: Option<u16> },
    // Import a specific thread, parser already has these parts
    ThreadRef { subreddit: String, post_id: String, slug: Option<String> },
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
        ClientCommand::ExecuteRedditImport(import) => {
            handle_execute_reddit_import_command(import, app_state).await
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
        
        UIAction::ShowScrollingSuggestions { query, suggestions, animation_interval_ms, loop_through } => {
            UIResponse::scrolling_suggestions(query, suggestions, animation_interval_ms, loop_through)
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
        
        UIAction::ImportRedditContent { url, entity_type, context: _ } => {
            // TODO: Implement Reddit content import
            UIResponse::not_yet_implemented(
                format!("Import {}", entity_type),
                format!("Would import {} from: {}", entity_type, url),
                None,
            )
        }
        
        UIAction::RenderEntityView { ns, pk } => {
            // Get the main entity
            let main_entity_result = sqlx::query_file_as!(
                entity::Entity,
                "../database/sql/entity/select.sql",
                ns,
                pk
            )
            .fetch_optional(&_app_state.db)
            .await;
            
            match main_entity_result {
                Ok(Some(entity_row)) => {
                    // Get children entities
                    let children_result = sqlx::query_file_as!(
                        entity::Entity,
                        "../database/sql/entity/select_children.sql",
                        ns,
                        pk
                    )
                    .fetch_all(&_app_state.db)
                    .await;

                    let children_entities = children_result.unwrap_or_default();

                    // Convert entity types
                    let main_entity = crate::ui::types::Entity {
                        id: format!("{}:{}", entity_row.ns, entity_row.pk),
                        title: entity_row.title.unwrap_or_else(|| format!("{}:{}", ns, pk)),
                        url: format!("/{}/{}", ns, pk),
                        entity_type: match ns.as_str() {
                            "reddit.subreddit" => crate::ui::types::EntityType::RedditSubreddit,
                            "reddit.post" => crate::ui::types::EntityType::RedditPost,
                            "reddit.comment" => crate::ui::types::EntityType::RedditComment,
                            "reddit.user" => crate::ui::types::EntityType::RedditUser,
                            _ => crate::ui::types::EntityType::Generic,
                        },
                        metadata: entity_row.metadata.unwrap_or_else(|| serde_json::json!({})),
                    };

                    let children: Vec<crate::ui::types::Entity> = children_entities
                        .into_iter()
                        .map(|child| crate::ui::types::Entity {
                            id: format!("{}:{}", child.ns, child.pk),
                            title: child.title.unwrap_or_else(|| format!("{}:{}", child.ns, child.pk)),
                            url: format!("/{}/{}", child.ns, child.pk),
                            entity_type: match child.ns.as_str() {
                                "reddit.subreddit" => crate::ui::types::EntityType::RedditSubreddit,
                                "reddit.post" => crate::ui::types::EntityType::RedditPost,
                                "reddit.comment" => crate::ui::types::EntityType::RedditComment,
                                "reddit.user" => crate::ui::types::EntityType::RedditUser,
                                _ => crate::ui::types::EntityType::Generic,
                            },
                            metadata: child.metadata.unwrap_or_else(|| serde_json::json!({})),
                        })
                        .collect();

                    let entity_view_data = crate::ui::types::EntityViewData {
                        entity: main_entity,
                        children,
                        rankings: Vec::new(), // TODO: Implement rankings from votes
                        breadcrumbs: Vec::new(), // TODO: Implement breadcrumbs
                    };

                    UIResponse::EntityView(entity_view_data)
                }
                Ok(None) | Err(_) => {
                    // Entity not found - offer import if it's a known type
                    if ns == "reddit.subreddit" {
                        use crate::ui::types::{SelectionItem, ImportAction};

                        let typed_command = ClientCommand::ExecuteRedditImport(
                            RedditImport::SubredditHot { subreddit: pk.clone(), limit: Some(25) }
                        );
                        let command = serde_json::to_value(&typed_command)
                            .unwrap_or_else(|_| serde_json::json!({}));

                        let items = vec![SelectionItem {
                            id: format!("import_{}", pk),
                            title: format!("r/{}", pk),
                            description: Some("Not imported yet".to_string()),
                            completion: format!("r/{}", pk),
                            import_action: Some(ImportAction {
                                label: "Import hot posts".to_string(),
                                description: "Import hot posts from this subreddit".to_string(),
                                command,
                            }),
                        }];

                        UIResponse::selection(
                            pk,
                            "Subreddits".to_string(),
                            "Select a subreddit or import a new one".to_string(),
                            items,
                        )
                    } else {
                        UIResponse::error(
                            "EntityNotFound".to_string(),
                            format!("Entity {}:{} not found", ns, pk),
                        )
                    }
                }
            }
        }
        
        UIAction::SuggestSubredditsFromDb { partial, prefix } => {
            use crate::ui::types::{SelectionItem, ImportAction};

            // Extract a clean subreddit slug from the user's partial input
            fn extract_subreddit_slug(input: &str) -> Option<String> {
                let lower = input.trim().to_lowercase();
                let mut s = lower.as_str();

                for p in [
                    "https://www.reddit.com/r/",
                    "http://www.reddit.com/r/",
                    "https://reddit.com/r/",
                    "http://reddit.com/r/",
                    "www.reddit.com/r/",
                    "reddit.com/r/",
                ] {
                    if s.starts_with(p) { s = &s[p.len()..]; break; }
                }
                if s.starts_with("r/") { s = &s[2..]; }
                let slug = s.split('/').next().unwrap_or("");
                if slug.is_empty() { None } else { Some(slug.to_string()) }
            }

            let maybe_slug = extract_subreddit_slug(&partial);
            let slug_for_search = maybe_slug.clone().unwrap_or_default();

            // Query database for existing subreddits starting with the slug
            let pattern = format!("{}%", slug_for_search);
            let existing_rows = sqlx::query!(
                "SELECT pk FROM entities WHERE ns = 'reddit.subreddit' AND pk ILIKE $1 ORDER BY pk LIMIT 10",
                pattern
            )
            .fetch_all(&_app_state.db)
            .await
            .unwrap_or_default();

            let mut items: Vec<SelectionItem> = existing_rows
                .into_iter()
                .map(|r| SelectionItem {
                    id: r.pk.clone(),
                    title: format!("r/{}", r.pk),
                    description: Some("Already imported".to_string()),
                    completion: format!("{}{}", prefix, r.pk),
                    import_action: None,
                })
                .collect();

            // If user typed a slug that doesn't exactly exist yet, offer an import action
            if let Some(slug) = maybe_slug {
                if !slug.is_empty() && !slug.contains(' ') {
                    let exact_exists: i64 = sqlx::query_scalar!(
                        "SELECT COUNT(*) as \"count!\" FROM entities WHERE ns = 'reddit.subreddit' AND pk = $1",
                        slug
                    )
                    .fetch_one(&_app_state.db)
                    .await
                    .unwrap_or(0);

                    if exact_exists == 0 {
                        // Build full command from typed enums to ensure it matches the server deserializer
                        let typed_command = ClientCommand::ExecuteRedditImport(
                            RedditImport::SubredditHot { subreddit: slug.clone(), limit: Some(25) }
                        );
                        let command = serde_json::to_value(&typed_command).unwrap_or_else(|_| serde_json::json!({}));

                        items.insert(0, SelectionItem {
                            id: format!("import_{}", slug),
                            title: format!("r/{}", slug),
                            description: Some("Not imported yet".to_string()),
                            completion: format!("{}{}", prefix, slug),
                            import_action: Some(ImportAction {
                                label: "Import hot posts".to_string(),
                                description: "Import hot posts from this subreddit".to_string(),
                                command,
                            }),
                        });
                    }
                }
            }

            UIResponse::selection(
                slug_for_search.clone(),
                "Subreddits".to_string(),
                "Select a subreddit or import a new one".to_string(),
                items,
            )
        }
        
        UIAction::ResolveAndDisplaySubreddit { subreddit, prefix } => {
            // 1. First, try an EXACT match on the entity
            let exact_match_result = sqlx::query_file_as!(
                entity::Entity,
                "../database/sql/entity/select.sql",
                "reddit.subreddit",
                subreddit
            )
            .fetch_optional(&_app_state.db)
            .await;

            if let Ok(Some(entity_row)) = exact_match_result {
                // SUCCESS: Found an exact match. Render its page immediately.
                let children_result = sqlx::query_file_as!(
                    entity::Entity,
                    "../database/sql/entity/select_children.sql",
                    "reddit.subreddit",
                    subreddit
                )
                .fetch_all(&_app_state.db)
                .await;

                let children_entities = children_result.unwrap_or_default();

                let main_entity = crate::ui::types::Entity {
                    id: format!("reddit.subreddit:{}", subreddit),
                    title: entity_row.title.unwrap_or_else(|| format!("r/{}", subreddit)),
                    url: format!("/reddit.subreddit/{}", subreddit),
                    entity_type: crate::ui::types::EntityType::RedditSubreddit,
                    metadata: entity_row.metadata.unwrap_or_else(|| serde_json::json!({})),
                };

                let children: Vec<crate::ui::types::Entity> = children_entities
                    .into_iter()
                    .map(|child| crate::ui::types::Entity {
                        id: format!("{}:{}", child.ns, child.pk),
                        title: child.title.unwrap_or_else(|| format!("{}:{}", child.ns, child.pk)),
                        url: format!("/{}/{}", child.ns, child.pk),
                        entity_type: match child.ns.as_str() {
                            "reddit.post" => crate::ui::types::EntityType::RedditPost,
                            "reddit.comment" => crate::ui::types::EntityType::RedditComment,
                            _ => crate::ui::types::EntityType::Generic,
                        },
                        metadata: child.metadata.unwrap_or_else(|| serde_json::json!({})),
                    })
                    .collect();

                let entity_view_data = crate::ui::types::EntityViewData {
                    entity: main_entity,
                    children,
                    rankings: Vec::new(),
                    breadcrumbs: Vec::new(),
                };

                return UIResponse::EntityView(entity_view_data);
            }

            // 2. No exact match found. Now, do a PARTIAL search for suggestions.
            let pattern = format!("{}%", subreddit);
            let suggestions_result = sqlx::query!(
                "SELECT pk FROM entities WHERE ns = 'reddit.subreddit' AND pk ILIKE $1 ORDER BY pk LIMIT 10",
                pattern
            )
            .fetch_all(&_app_state.db)
            .await
            .unwrap_or_default();

            let mut suggestion_items: Vec<crate::ui::types::SelectionItem> = suggestions_result
                .iter()
                .map(|r| crate::ui::types::SelectionItem {
                    id: r.pk.clone(),
                    title: format!("r/{}", r.pk),
                    description: Some("Already imported".to_string()),
                    // Remove the subreddit part from prefix and add the full suggestion
                    completion: format!("{}{}", 
                        prefix.trim_end_matches(&subreddit), 
                        r.pk
                    ),
                    import_action: None,
                })
                .collect();

            // 3. Create the "Import this subreddit" item for what they actually typed
            let import_command = ClientCommand::ExecuteRedditImport(
                RedditImport::SubredditHot { 
                    subreddit: subreddit.clone(), 
                    limit: Some(25) 
                }
            );
            let import_item = crate::ui::types::SelectionItem {
                id: format!("import_{}", subreddit),
                title: format!("r/{}", subreddit),
                description: Some("Not yet imported".to_string()),
                completion: prefix.clone(),
                import_action: Some(crate::ui::types::ImportAction {
                    label: "Import".to_string(),
                    description: "Import hot posts from this subreddit".to_string(),
                    command: serde_json::to_value(&import_command).unwrap_or_else(|_| serde_json::json!({})),
                }),
            };

            // Always show the import option for what they actually typed
            suggestion_items.insert(0, import_item);

            // 4. Create responses for both TAB completion AND selection UI
            let mut responses = Vec::new();

            // First: Add a Suggestions response for TAB completion (if we have DB suggestions)
            if !suggestions_result.is_empty() {
                let best_match = &suggestions_result[0]; // Use the first/best match for TAB completion
                let tab_completion = format!("{}{}", 
                    prefix.trim_end_matches(&subreddit), 
                    best_match.pk
                );
                
                responses.push(UIResponse::Suggestions(crate::ui::types::SuggestionsData {
                    query: prefix.clone(),
                    suggestion: Some(crate::ui::types::Suggestion {
                        text: tab_completion.clone(),
                        completion: tab_completion,
                        description: Some(format!("Complete to r/{}", best_match.pk)),
                        score: 1.0,
                    }),
                }));
            }

            // Second: Add the Selection response for clickable options
            let title = if suggestions_result.len() > 0 {
                format!("r/{} not found. Did you mean...", subreddit)
            } else {
                format!("Import r/{}", subreddit)
            };

            responses.push(UIResponse::selection(
                subreddit.clone(),
                title,
                format!("Options for 'r/{}'", subreddit),
                suggestion_items,
            ));

            UIResponse::multiple(responses)
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

async fn handle_execute_reddit_import_command(
    import: RedditImport,
    app_state: &AppState,
) -> UIResponse {
    log::info!("Executing Reddit import: {:?}", import);

    match reddit_import_logic(import, app_state).await {
        Ok(response) => response,
        Err(e) => {
            log::error!("Import failed: {}", e);
            UIResponse::error(
                "ImportFailed".to_string(),
                e.to_string(),
            )
        }
    }
}

/// Import Reddit content based on source and context
async fn reddit_import_logic(
    import: RedditImport,
    app_state: &AppState,
) -> Result<UIResponse, Box<dyn std::error::Error + Send + Sync>> {
    match import {
        RedditImport::SubredditHot { subreddit, limit } => {
            let lim = limit.unwrap_or(25) as usize;

            // Fetch posts from Reddit
            let listing = app_state
                .reddit_client
                .get_subreddit_hot(&subreddit, lim)
                .await?;

            let posts_owned = listing.into_posts();
            let post_refs: Vec<&RedditPost> = posts_owned.iter().collect();
            let imported_count = import_posts_to_database(&post_refs, &subreddit, app_state).await?;

            // After import, get and return the entity view with the imported posts
            let main_entity_result = sqlx::query_file_as!(
                entity::Entity,
                "../database/sql/entity/select.sql",
                "reddit.subreddit",
                subreddit
            )
            .fetch_optional(&app_state.db)
            .await;
            
            match main_entity_result {
                Ok(Some(entity_row)) => {
                    let children_result = sqlx::query_file_as!(
                        entity::Entity,
                        "../database/sql/entity/select_children.sql",
                        "reddit.subreddit",
                        subreddit
                    )
                    .fetch_all(&app_state.db)
                    .await;

                    let children_entities = children_result.unwrap_or_default();
                    
                    let main_entity = crate::ui::types::Entity {
                        id: format!("reddit.subreddit:{}", subreddit),
                        title: entity_row.title.unwrap_or_else(|| format!("r/{}", subreddit)),
                        url: format!("/reddit.subreddit/{}", subreddit),
                        entity_type: crate::ui::types::EntityType::RedditSubreddit,
                        metadata: entity_row.metadata.unwrap_or_else(|| serde_json::json!({})),
                    };

                    let children: Vec<crate::ui::types::Entity> = children_entities
                        .into_iter()
                        .map(|child| crate::ui::types::Entity {
                            id: format!("{}:{}", child.ns, child.pk),
                            title: child.title.unwrap_or_else(|| format!("{}:{}", child.ns, child.pk)),
                            url: format!("/{}/{}", child.ns, child.pk),
                            entity_type: match child.ns.as_str() {
                                "reddit.post" => crate::ui::types::EntityType::RedditPost,
                                "reddit.comment" => crate::ui::types::EntityType::RedditComment,
                                _ => crate::ui::types::EntityType::Generic,
                            },
                            metadata: child.metadata.unwrap_or_else(|| serde_json::json!({})),
                        })
                        .collect();

                    let entity_view_data = crate::ui::types::EntityViewData {
                        entity: main_entity,
                        children,
                        rankings: Vec::new(),
                        breadcrumbs: Vec::new(),
                    };

                    Ok(UIResponse::EntityView(entity_view_data))
                }
                Ok(None) => {
                    log::error!("Entity not found after import");
                    Ok(UIResponse::error(
                        "ImportSuccess".to_string(),
                        format!("Successfully imported {} posts from r/{}/hot", imported_count, subreddit),
                    ))
                }
                Err(e) => {
                    log::error!("Failed to get entity after import: {:?}", e);
                    Ok(UIResponse::error(
                        "ImportSuccess".to_string(),
                        format!("Successfully imported {} posts from r/{}/hot", imported_count, subreddit),
                    ))
                }
            }
        }

        RedditImport::ThreadRef { subreddit, post_id, .. } => {
            // Fetch post and comments
            let listings = app_state
                .reddit_client
                .get_post(&subreddit, &post_id)
                .await?;

            let mut imported_posts = 0;
            let mut imported_comments = 0;

            for listing in listings {
                let posts = listing.get_posts();
                let comments = listing.get_comments();

                if !posts.is_empty() {
                    imported_posts += import_posts_to_database(&posts, &subreddit, app_state).await?;
                }

                if !comments.is_empty() {
                    imported_comments += import_comments_to_database(&comments, &subreddit, app_state).await?;
                }
            }

            // After thread import, get and return the entity view
            let main_entity_result = sqlx::query_file_as!(
                entity::Entity,
                "../database/sql/entity/select.sql",
                "reddit.subreddit",
                subreddit
            )
            .fetch_optional(&app_state.db)
            .await;
            
            match main_entity_result {
                Ok(Some(entity_row)) => {
                    let children_result = sqlx::query_file_as!(
                        entity::Entity,
                        "../database/sql/entity/select_children.sql",
                        "reddit.subreddit",
                        subreddit
                    )
                    .fetch_all(&app_state.db)
                    .await;

                    let children_entities = children_result.unwrap_or_default();
                    
                    let main_entity = crate::ui::types::Entity {
                        id: format!("reddit.subreddit:{}", subreddit),
                        title: entity_row.title.unwrap_or_else(|| format!("r/{}", subreddit)),
                        url: format!("/reddit.subreddit/{}", subreddit),
                        entity_type: crate::ui::types::EntityType::RedditSubreddit,
                        metadata: entity_row.metadata.unwrap_or_else(|| serde_json::json!({})),
                    };

                    let children: Vec<crate::ui::types::Entity> = children_entities
                        .into_iter()
                        .map(|child| crate::ui::types::Entity {
                            id: format!("{}:{}", child.ns, child.pk),
                            title: child.title.unwrap_or_else(|| format!("{}:{}", child.ns, child.pk)),
                            url: format!("/{}/{}", child.ns, child.pk),
                            entity_type: match child.ns.as_str() {
                                "reddit.post" => crate::ui::types::EntityType::RedditPost,
                                "reddit.comment" => crate::ui::types::EntityType::RedditComment,
                                _ => crate::ui::types::EntityType::Generic,
                            },
                            metadata: child.metadata.unwrap_or_else(|| serde_json::json!({})),
                        })
                        .collect();

                    let entity_view_data = crate::ui::types::EntityViewData {
                        entity: main_entity,
                        children,
                        rankings: Vec::new(),
                        breadcrumbs: Vec::new(),
                    };

                    Ok(UIResponse::EntityView(entity_view_data))
                }
                Ok(None) => {
                    log::error!("Entity not found after thread import");
                    Ok(UIResponse::error(
                        "ImportSuccess".to_string(),
                        format!("Successfully imported {} posts and {} comments from r/{}/comments/{}",
                                imported_posts, imported_comments, subreddit, post_id),
                    ))
                }
                Err(e) => {
                    log::error!("Failed to get entity after thread import: {:?}", e);
                    Ok(UIResponse::error(
                        "ImportSuccess".to_string(),
                        format!("Successfully imported {} posts and {} comments from r/{}/comments/{}",
                                imported_posts, imported_comments, subreddit, post_id),
                    ))
                }
            }
        }
    }
}

/// Import Reddit posts to the database
async fn import_posts_to_database(
    posts: &[&RedditPost],
    subreddit: &str,
    app_state: &AppState,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    use serde_json::to_value;
    
    let mut imported_count = 0;
    
    // Resolve admin user from DB (seeded in migrations)
    let admin_user_id: uuid::Uuid = sqlx::query_scalar!("SELECT id FROM users WHERE auth0_sub = $1", "admin")
        .fetch_one(&app_state.db)
        .await?;
    
    // Ensure the subreddit entity exists (minimal metadata)
    entity::create_entity_ignore_conflict(
        &app_state.db,
        "reddit.subreddit",
        subreddit,
        None,
        None,
        None,
        admin_user_id,
    )
    .await?;
    
    for post in posts {
        let post = *post;

        // Serialize the full RedditPost as metadata
        let metadata_val = to_value(post)?;

        // Create post entity
        match entity::create_entity_ignore_conflict(
            &app_state.db,
            "reddit.post",
            &post.id,
            Some(post.title.as_str()),
            post.thumbnail.as_deref(),
            Some(&metadata_val),
            admin_user_id,
        )
        .await
        {
            Ok(_) => {
                // Create relationship: subreddit -> post
                let payload = entity_relationships::CreateRelationshipPayload {
                    parent_ns: "reddit.subreddit".to_string(),
                    parent_pk: subreddit.to_string(),
                    child_ns: "reddit.post".to_string(),
                    child_pk: post.id.clone(),
                };
                entity_relationships::create_relationship_ignore_conflict(
                    &app_state.db,
                    payload,
                    admin_user_id,
                )
                .await?;
                
                imported_count += 1;
                log::debug!("Imported post: {}", post.id);
            }
            Err(e) => {
                log::warn!("Failed to import post {}: {}", post.id, e);
            }
        }
    }
    
    log::info!("Imported {} posts to r/{}", imported_count, subreddit);
    Ok(imported_count)
}

/// Import Reddit comments to the database
async fn import_comments_to_database(
    comments: &[&RedditComment],
    _subreddit: &str,
    app_state: &AppState,
) -> Result<usize, Box<dyn std::error::Error + Send + Sync>> {
    use serde_json::to_value;
    
    let mut imported_count = 0;
    
    let admin_user_id: uuid::Uuid = sqlx::query_scalar!("SELECT id FROM users WHERE auth0_sub = $1", "admin")
        .fetch_one(&app_state.db)
        .await?;
    
    for comment in comments {
        let comment = *comment;

        // Serialize the full RedditComment as metadata
        let metadata_val = to_value(comment)?;

        // Create comment entity (no title/profile picture)
        match entity::create_entity_ignore_conflict(
            &app_state.db,
            "reddit.comment",
            &comment.id,
            None,
            None,
            Some(&metadata_val),
            admin_user_id,
        )
        .await
        {
            Ok(_) => {
                // Create relationship based on parent_id
                if let Some(parent_id) = comment.parent_id.strip_prefix("t3_") {
                    // Parent is a post
                    let payload = entity_relationships::CreateRelationshipPayload {
                        parent_ns: "reddit.post".to_string(),
                        parent_pk: parent_id.to_string(),
                        child_ns: "reddit.comment".to_string(),
                        child_pk: comment.id.clone(),
                    };
                    entity_relationships::create_relationship_ignore_conflict(
                        &app_state.db,
                        payload,
                        admin_user_id,
                    )
                    .await?;
                } else if let Some(parent_id) = comment.parent_id.strip_prefix("t1_") {
                    // Parent is another comment
                    let payload = entity_relationships::CreateRelationshipPayload {
                        parent_ns: "reddit.comment".to_string(),
                        parent_pk: parent_id.to_string(),
                        child_ns: "reddit.comment".to_string(),
                        child_pk: comment.id.clone(),
                    };
                    entity_relationships::create_relationship_ignore_conflict(
                        &app_state.db,
                        payload,
                        admin_user_id,
                    )
                    .await?;
                }
                
                imported_count += 1;
                log::debug!("Imported comment: {}", comment.id);
            }
            Err(e) => {
                log::warn!("Failed to import comment {}: {}", comment.id, e);
            }
        }
    }
    
    log::info!("Imported {} comments", imported_count);
    Ok(imported_count)
}

