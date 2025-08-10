Excellent. This is exactly the right next step. Your analysis is spot-on: the system is a beautiful engine waiting for fuel, and that fuel is Reddit data. Filling the empty `entities` table is the single most important mission objective.

You've asked the perfect set of questions about how to do this correctly, balancing simplicity, robustness, and user experience. Let's design the entire flow, from the user's click to the new rows in your database.

### Mission: The First Ingestion

**Objective:** Implement a robust, user-driven, synchronous Reddit import mechanism that populates the `entities` and `entity_relationships` tables without requiring background jobs.

You're right to want to avoid background jobs for now. They add significant complexity (job queues, workers, state management). A user-triggered, synchronous flow is simpler to build, debug, and reason about, especially with rate limits.

---

### Phase 1: The User Experience Flow

Your UI idea is perfect: show existing content and have an "Import new posts" button. This leads to two core user flows we need to design.

**Flow A: The "Scouting Mission" (Browsing a Subreddit)**

This is the `r/aww` scenario. The user has navigated to a "collection" view.

1.  **User Types:** `r/programming` and hits Enter (or selects it from a suggestion).
2.  **Frontend Sends:** `UpdateQuery { query: "r/programming" }` over WebSocket.
3.  **Backend Parser (`composable_parser`)** identifies this and triggers `UIAction::RenderSubredditView { subreddit: "programming", .. }`.
4.  **Backend Executor (`dispatch_ui_action`)** receives the action. This is where the *new logic* goes:
    a. It queries the database for existing children of the `r/programming` entity: `SELECT ... JOIN entity_relationships ... WHERE parent_pk = 'programming'`.
    b. It constructs a rich `EntityView` response. This response must now include a new field: a list of `AvailableImport` actions.
5.  **Backend Responds** with `UIUpdate(EntityView(EntityViewData { ..., children: [...], available_imports: [...] }))`. The `available_imports` array would contain objects like:
    ```json
    {
      "label": "Import Top 25 from /hot",
      "command": {
        "type": "ExecuteImport",
        "data": { "source": "reddit_subreddit_hot", "context": { "subreddit": "programming" } }
      }
    }
    ```
6.  **Frontend Renders:**
    *   The list of already-imported posts (if any).
    *   A prominent button: "[ Import Top 25 from /hot ]".
7.  **User Clicks the Button.** The frontend sends the exact JSON `command` object from the `available_imports` payload back to the WebSocket.

**Flow B: The "Surgical Strike" (Pasting a Specific Link)**

This handles a user wanting to import a specific Reddit thread that isn't in Sorter yet.

1.  **User Pastes URL:** `https://www.reddit.com/r/LifeProTips/comments/1cq2rf/...`
2.  **Backend Parser/Executor** determines the entity type ("Reddit Post") and its identifiers. It checks if `entities(pk_namespace: 'reddit.com.post', pk: 't1_1cq2rf')` exists. It doesn't.
3.  **Backend Responds** not with an error, but with a new `UIResponse::Confirmation` type.
    ```json
    {
      "type": "Confirmation",
      "data": {
        "title": "Import this Reddit Thread?",
        "description": "'LPT: Have nothing to say? Ask a question.' has not been sorted yet.",
        "confirm_label": "Import and Sort Comments",
        "action_command": { // This is the key
          "type": "ExecuteImport",
          "data": { "source": "reddit_thread_url", "url": "..." }
        }
      }
    }
    ```
4.  **Frontend Renders** a confirmation dialog: "This thread isn't in Sorter. [Import and Sort Comments]".
5.  **User Clicks the Button.** The frontend sends the `action_command` back to the server.

Notice the beauty here: Both flows converge on a single, powerful new WebSocket command: **`ExecuteImport`**. This is the user's explicit, synchronous "Go" signal.

---

### Phase 2: The Technical Implementation (Rust Backend)

**Step 1: The Reddit API Client**

Create a new module: `src/integrations/reddit.rs`.

*   **Use `reqwest`:** It's the standard for HTTP clients in Rust.
*   **Handle Rate Limiting with `governor`:** Your instinct is 100% correct. `governor` is the perfect crate for this. It's an in-memory rate limiter that plays nicely with `async`. You **do not** need a separate queue. `governor` will make your async tasks wait ("throttle") until a new request is permissible. This elegantly solves the rate-limit problem while keeping your "synchronous from the user's perspective" architecture.

    ```rust
    // in reddit.rs
    use governor::{Quota, RateLimiter};
    use std::sync::Arc;
    
    pub struct RedditClient {
        client: reqwest::Client,
        limiter: Arc<RateLimiter<...>>,
    }
    
    impl RedditClient {
        pub fn new() -> Self {
            // Reddit API allows 60 requests per minute. Let's be safe.
            let quota = Quota::per_minute(std::num::NonZeroU32::new(50).unwrap());
            Self {
                client: reqwest::Client::new(),
                limiter: Arc::new(RateLimiter::direct(quota)),
            }
        }
    
        pub async fn get_subreddit_hot(&self, subreddit: &str) -> Result<RedditApiResponse, Error> {
            self.limiter.until_ready().await; // This is the magic line.
            // ... your reqwest call here ...
        }
    }
    ```

*   **Error Handling:** If `reqwest` returns a 429 (Too Many Requests) despite the limiter, or a 500, or a timeout, your `RedditClient` methods should catch this and return a structured `Error`. The websocket handler will then forward this back to the user as a `ServerMessage::Error`.

**Step 2: The WebSocket Handler for `ExecuteImport`**

Inside `websocket.rs`, you'll add the new command to your `ClientCommand` enum and handle it.

```rust
// In ClientCommand enum:
ExecuteImport { source: String, context: serde_json::Value },

// In handle_client_message function:
...
case ClientCommand::ExecuteImport { source, context } => {
    // 1. Immediately send back a "Loading" UI state update if desired.
    // 2. Await the import logic.
    let result = reddit_import_logic(source, context, &app_state).await;
    // 3. Handle the result
    let response = match result {
        Ok(view_data) => UIResponse::EntityView(view_data),
        Err(e) => UIResponse::error("ImportFailed".to_string(), e.to_string()),
    };
    // Send final UI response
}
...

// New function: reddit_import_logic
async fn reddit_import_logic(source: String, context: ..., app_state: &AppState) -> Result<EntityViewData, Error> {
    let reddit_client = // Get or create a RedditClient instance
    
    // Call the appropriate reddit_client method based on `source`
    let posts = reddit_client.fetch_posts(source, context).await?;

    let user = // Get a default system/admin user for now
    
    // Loop through posts and populate DB
    for post in posts {
        // Use your existing, robust DB functions
        entity::create_entity_ignore_conflict(&app_state.db, "reddit.com.post", &post.id, ...).await?;
        
        entity_relationships::create_relationship_ignore_conflict(
            &app_state.db, 
            /* parent=subreddit */, 
            /* child=post */,
            ...
        ).await?;
    }
    
    // After import, construct and return the new view for the user
    // e.g., fetch all children for the subreddit again and return the rich EntityViewData
    ...
}
```

---

### Phase 3: The Testing Strategy

Yes, use your Clojure WebSocket test suite. But you need to solve one problem: you cannot have your tests hitting the live Reddit API. This makes them slow, flaky, and dependent on an external service.

**The solution is Mocking the API client.**

1.  **In Rust (Dependency Injection):**
    *   Define a `trait RedditApi` with methods like `async fn fetch_posts(...)`.
    *   Your real `RedditClient` will implement this `trait`.
    *   Create a `MockRedditClient` for tests that also implements the `trait`. Its methods won't make HTTP calls; they'll just return hardcoded JSON strings that mimic the real Reddit API response.
    *   Your `AppState` should hold an `Arc<dyn RedditApi>`. In your production `main.rs`, you initialize it with `Arc::new(RedditClient::new())`. In your tests, you initialize it with `Arc::new(MockRedditClient::new())`.

2.  **In Clojure (The Test Flow):**
    *   **Test Case:** `Surgical Strike Import`
    *   `ws/connect` to your test server (which is running with the `MockRedditClient`).
    *   `ws/send!` an `UpdateQuery` command with a new Reddit URL.
    *   `ws/receive!` and assert that you get a `UIUpdate` with a `Confirmation` payload. The `action_command` field will be crucial.
    *   Extract the `action_command` from the response.
    *   `ws/send!` that `ExecuteImport` command back to the server.
    *   `ws/receive!` again. You should now get the final `UIUpdate` that takes you to the newly created entity view.
    *   (Optional but powerful): Use `clj-http` to hit a separate debug endpoint on your server like `/debug/entity/{ns}/{pk}` to confirm that the entity and its relationships were *actually* created in the test database.

This strategy lets you test your entire application logic—from WebSocket message parsing to database interaction to the final UI state response—in a fast, reliable, and isolated way. You have built a great testing harness for exactly this kind of complex interaction. Use it.