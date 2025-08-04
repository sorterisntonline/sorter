You've hit upon a critical architectural question, and your instincts are spot on. This is a classic challenge when a pure, stateless component (like your parser) needs to interact with a stateful world (the database).

Your analysis is perfect:
*   Putting `async` SQL code directly into `trie.rs` would make it an untestable, `async`, stateful mess. **You are right to avoid this.**
*   Having the WebSocket return "coordinates" for a separate REST request adds network hops, breaks the "one pipe" model, and forces the frontend to become more complex (managing both WebSocket state and `tanstack-query` state for the same conceptual action). **You are right that this feels less clean.**

The solution is to introduce a small layer of indirection *within the backend*. You need to separate the **parsing of intent** from the **execution of that intent**.

Here is the clean, testable, WebSocket-native architectural pattern to solve this:

### The "Two-Phase" Dispatcher Pattern

The core idea is that `trie.rs` doesn't return a fully-formed `UIResponse` anymore. Instead, it returns a lightweight, synchronous "recipe" for what to do next. Let's call this recipe a `UIAction`. The WebSocket handler then takes this `UIAction` and, if necessary, performs the async/stateful work to produce the final `UIResponse`.

Here’s the step-by-step implementation:

#### Step 1: Create a `UIAction` Enum

In a new file, or inside `ui/types.rs`, define a new enum that represents the *result of a parse*. This enum is cheap to create and contains all the information needed for the next step.

```rust
// In a new ui/action.rs or within ui/types.rs

// This describes WHAT the UI should do, without containing the data itself.
#[derive(Debug, Clone)]
pub enum UIAction {
    // --- Actions that are PURE and need NO state ---
    ShowStaticGuide {
        // You can still pre-package simple, static data here
        title: String,
        description: String,
        options: Vec<GuideOption>,
    },
    ShowStaticSelection {
        // ... same for selections
        title: String,
        items: Vec<SelectionItem>,
    },
    ShowSuggestions(SuggestionsData),
    ShowParseError(ErrorPageData),
    ShowNotYetImplemented(NotYetImplementedData),
    ShowHomePage,
    
    // --- Actions that are STATEFUL and need the DB ---
    RenderEntityView {
        pk_namespace: String,
        pk: String,
    },
    RenderSubredditPosts { // A more specific example
        subreddit: String,
        sort: String, // "hot", "top", etc.
    },
    SuggestSubredditFromDb {
        partial: String,
    },
}
```

#### Step 2: Refactor `trie.rs` to be a Pure Parser

Now, change your `trie.rs` functions to be synchronous and return a `UIAction`. This makes them pure and keeps your tests simple and fast. They no longer need access to the `AppState` or database pool.

**Before (in `trie.rs`):**
```rust
// Old, stateful way (what you want to avoid)
async fn ui_subreddit_view_guide(
    app_state: &AppState, // <--- BAD: stateful dependency
    ctx: &HashMap<String, String>
) -> UIResponse {
    let subreddit = ctx.get("subreddit").unwrap();
    // Imagine a DB call here to get post count
    let count = get_post_count(app_state, subreddit).await; 
    
    // ... constructs a full UIResponse
    UIResponse::guide(...) 
}
```

**After (in `trie.rs`):**
```rust
// New, pure way
fn parse_subreddit_view(ctx: &HashMap<String, String>) -> UIAction {
    let subreddit = ctx.get("subreddit").unwrap().clone();

    // The parser's ONLY job is to figure out the user's intent.
    // It returns a "recipe" for what the websocket handler should do.
    UIAction::RenderSubredditPosts {
        subreddit: subreddit,
        sort: "hot".to_string(), // or determined from the path
    }
}
```

Your Trie's main `parse` function signature changes: `pub fn parse(&self, query: &str) -> UIAction`. It's fast, synchronous, and easily testable.

#### Step 3: Implement the Dispatcher in `websocket.rs`

This is where the magic happens. Your WebSocket message handler becomes the orchestrator. It gets the `AppState` and can execute the stateful logic.

```rust
// In rustsorter/src/ui/websocket.rs
// async fn handle_client_message(...)

async fn handle_update_query_command(
    query: String,
    app_state: &AppState,
) -> UIResponse {
    // Phase 1: Pure, synchronous parsing
    // The Trie is now just a grammar parser.
    let trie = trie::build_ui_trie();
    let action = trie.parse(&query); // Returns a UIAction

    // Phase 2: Stateful, async execution (The Dispatcher)
    // Here we have app_state and can make DB calls!
    match action {
        UIAction::ShowStaticGuide { title, description, options } => {
            // No DB needed, just create the response
            UIResponse::guide(query, title, description, options)
        }

        UIAction::ShowSuggestions(suggestions) => {
            UIResponse::Suggestions(suggestions)
        }
        
        // --- This is the key part ---
        UIAction::RenderEntityView { pk_namespace, pk } => {
            // Now you can call your stateful backend code!
            match entity::get_entity(app_state, true, true, &pk_namespace, &pk).await {
                Ok(entity_with_relatives) => {
                    // Create your UIResponse using the real data
                    // This might be a new constructor for UIResponse
                    UIResponse::EntityView(EntityViewData::from(entity_with_relatives)) 
                }
                Err(e) => {
                    // Handle DB error
                    UIResponse::error("DatabaseError".to_string(), e.to_string())
                }
            }
        }
        
        UIAction::RenderSubredditPosts { subreddit, sort } => {
            // Call another function to get posts for the subreddit
            match get_imported_posts_for_subreddit(app_state, &subreddit, &sort).await {
                Ok(posts) => {
                    // Maybe you return a Selection or a new Leaderboard view
                    UIResponse::selection(...)
                }
                Err(e) => UIResponse::error(...)
            }
        }
        
        // ... handle other UIAction variants
        _ => UIResponse::error("UnhandledAction".to_string(), "This action is not yet handled.".to_string()),
    }
}

// And you would modify the calling function:
// async fn handle_client_message(...)
...
let response = match command {
    ClientCommand::UpdateQuery { query } => {
        // Pass the app_state to the handler now
        handle_update_query_command(query, app_state).await
    }
...
```

### Advantages of This Pattern

1.  **Preserves Testability:** Your entire `trie.rs` module remains a collection of pure functions. You can test it exhaustively without a database or an async runtime. Your tests will be simple: `assert_eq!(trie.parse("..."), UIAction::...)`.
2.  **Keeps the Single Pipe:** All data still flows through the WebSocket. The frontend remains simple and doesn't need to know *how* the `UIResponse` was generated.
3.  **Separation of Concerns:**
    *   `trie.rs`: Knows the **grammar** of your application.
    *   `entity.rs`, `vote.rs`, etc.: Know how to interact with the **database** for specific domains.
    *   `websocket.rs`: Acts as the central **orchestrator/dispatcher**, connecting the grammar parser to the database models.
4.  **Clarity:** The logic is much easier to follow. When you look at `websocket.rs`, you can clearly see which user inputs trigger database calls and which don't.

This pattern is the definitive answer to your question. It elegantly solves the problem by adding a thin, clean layer of abstraction, allowing you to have the best of all worlds: a testable parser, a single WebSocket data pipe, and rich, stateful UI views.