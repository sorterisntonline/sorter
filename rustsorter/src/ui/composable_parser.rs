use std::collections::HashMap;
use std::rc::Rc;
use std::cell::RefCell;
use crate::ui::action::UIAction;
use crate::ui::types::{Suggestion, GuideOption, SelectionItem};

// --- Core Abstractions ---

/// Unique identifier for nodes in the graph
type NodeId = &'static str;

/// Pattern matching for edges
#[derive(Debug, Clone)]
pub enum EdgePattern {
    /// Matches exact literal string
    Literal(&'static str),
    
    /// Matches any prefix of a string and suggests the full string
    /// e.g., PrefixOf("reddit.com") matches "r", "re", "red", "reddit", "reddit.com"
    PrefixOf(&'static str),
    
    /// Captures a variable segment (e.g., subreddit name, username)
    Variable(&'static str),
    
    /// Matches any string (wildcard)
    Any,
}

impl EdgePattern {
    /// Try to match this pattern against input, return (consumed_chars, captured_value)
    fn matches(&self, input: &str) -> Option<(usize, Option<String>)> {
        match self {
            EdgePattern::Literal(lit) => {
                if input.starts_with(lit) {
                    Some((lit.len(), None))
                } else {
                    None
                }
            }
            EdgePattern::PrefixOf(target) => {
                // Check if input is a prefix of target
                if target.starts_with(input) && !input.is_empty() {
                    // It's a valid prefix
                    Some((input.len(), None))
                } else if input.starts_with(target) {
                    // Full match
                    Some((target.len(), None))
                } else {
                    None
                }
            }
            EdgePattern::Variable(var_name) => {
                // Consume until next '/' or end of string
                let end = input.find('/').unwrap_or(input.len());
                if end > 0 {
                    let captured = input[..end].to_string();
                    // Validate based on variable type
                    if is_valid_variable(var_name, &captured) {
                        Some((end, Some(captured)))
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            EdgePattern::Any => {
                // Match everything until next '/' or end
                let end = input.find('/').unwrap_or(input.len());
                if end > 0 {
                    Some((end, Some(input[..end].to_string())))
                } else {
                    None
                }
            }
        }
    }
    
    /// Get the completion suggestion for this pattern
    fn completion(&self, partial: &str) -> Option<String> {
        match self {
            EdgePattern::PrefixOf(target) => {
                if target.starts_with(partial) && partial != *target {
                    Some(target.to_string())
                } else {
                    None
                }
            }
            _ => None,
        }
    }
}

/// Edge in the graph
pub struct Edge {
    pattern: EdgePattern,
    target: NodeId,
    /// Optional description for autocomplete
    description: Option<&'static str>,
}

/// Handler function for generating UI actions
type Handler = Box<dyn Fn(&str, &HashMap<String, String>) -> UIAction>;

/// Node in the graph
pub struct Node {
    id: NodeId,
    edges: Vec<Edge>,
    handler: Option<Handler>,
}

/// The composable parser graph
pub struct Graph {
    nodes: HashMap<NodeId, Rc<RefCell<Node>>>,
    root: NodeId,
}

// --- Graph Builder (Fluent API) ---

pub struct GraphBuilder {
    nodes: HashMap<NodeId, Rc<RefCell<Node>>>,
    current_node: Option<NodeId>,
    root: NodeId,
}

impl GraphBuilder {
    pub fn new() -> Self {
        let mut nodes = HashMap::new();
        let root_node = Rc::new(RefCell::new(Node {
            id: "root",
            edges: Vec::new(),
            handler: None,
        }));
        nodes.insert("root", root_node);
        
        GraphBuilder {
            nodes,
            current_node: Some("root"),
            root: "root",
        }
    }
    
    /// Select a node to add edges to
    pub fn at(mut self, node_id: NodeId) -> Self {
        // Create node if it doesn't exist
        if !self.nodes.contains_key(node_id) {
            let node = Rc::new(RefCell::new(Node {
                id: node_id,
                edges: Vec::new(),
                handler: None,
            }));
            self.nodes.insert(node_id, node);
        }
        self.current_node = Some(node_id);
        self
    }
    
    /// Add an edge from the current node
    pub fn edge(self, pattern: EdgePattern, target: NodeId) -> Self {
        self.edge_with_desc(pattern, target, None)
    }
    
    /// Add an edge with description
    pub fn edge_with_desc(mut self, pattern: EdgePattern, target: NodeId, desc: Option<&'static str>) -> Self {
        let current = self.current_node.expect("No current node selected");
        
        // Create target node if it doesn't exist
        if !self.nodes.contains_key(target) {
            let node = Rc::new(RefCell::new(Node {
                id: target,
                edges: Vec::new(),
                handler: None,
            }));
            self.nodes.insert(target, node);
        }
        
        // Add edge to current node
        if let Some(node) = self.nodes.get(current) {
            node.borrow_mut().edges.push(Edge {
                pattern,
                target,
                description: desc,
            });
        }
        
        self
    }
    
    /// Set handler for current node
    pub fn handler<F>(self, handler: F) -> Self 
    where 
        F: Fn(&str, &HashMap<String, String>) -> UIAction + 'static
    {
        let current = self.current_node.expect("No current node selected");
        if let Some(node) = self.nodes.get(current) {
            node.borrow_mut().handler = Some(Box::new(handler));
        }
        self
    }
    
    /// Build the final graph
    pub fn build(self) -> Graph {
        Graph {
            nodes: self.nodes,
            root: self.root,
        }
    }
}

// --- Parser Implementation ---

impl Graph {
    pub fn parse(&self, input: &str) -> UIAction {
        let normalized = input.trim().to_lowercase();
        let mut state = ParserState {
            input: &normalized,
            cursor: 0,
            current_node_id: self.root,
            context: HashMap::new(),
            original_query: input.to_string(),
        };
        
        self.parse_recursive(&mut state)
    }
    
    fn parse_recursive(&self, state: &mut ParserState) -> UIAction {
        let node = self.nodes.get(state.current_node_id)
            .expect("Node not found in graph");
        let node_ref = node.borrow();
        
        // If we've consumed all input, check for handler or suggestions
        if state.cursor >= state.input.len() {
            if let Some(handler) = &node_ref.handler {
                return handler(&state.original_query, &state.context);
            }
            
            // No handler, try to suggest based on available edges
            return self.suggest_from_edges(&node_ref, state);
        }
        
        let remaining = &state.input[state.cursor..];
        
        // Try to match each edge
        for edge in &node_ref.edges {
            if let Some((consumed, captured)) = edge.pattern.matches(remaining) {
                // Save state for potential backtracking
                let saved_cursor = state.cursor;
                let saved_node = state.current_node_id;
                
                // Update state
                state.cursor += consumed;
                state.current_node_id = edge.target;
                
                // Store captured variable if any
                if let Some(value) = captured {
                    if let EdgePattern::Variable(var_name) = &edge.pattern {
                        state.context.insert(var_name.to_string(), value);
                    }
                }
                
                // Check if this is a partial match that needs completion
                if state.cursor == state.input.len() {
                    if let Some(completion) = edge.pattern.completion(remaining) {
                        // Preserve what was typed before this segment
                        let prefix = &state.input[..state.cursor - consumed];
                        let full_completion = format!("{}{}", prefix, completion);
                        return UIAction::suggest(
                            state.original_query.clone(),
                            Some(Suggestion {
                                text: full_completion.clone(),
                                completion: full_completion,
                                description: edge.description.map(|d| d.to_string()),
                                score: 1.0,
                            })
                        );
                    }
                }
                
                // Continue parsing from the target node
                let result = self.parse_recursive(state);
                
                // If we got a valid response, return it
                if !matches!(result, UIAction::ShowError(_)) {
                    return result;
                }
                
                // Otherwise, restore state and try next edge
                state.cursor = saved_cursor;
                state.current_node_id = saved_node;
            }
        }
        
        // No edges matched - try to provide suggestions
        self.suggest_from_edges(&node_ref, state)
    }
    
    fn suggest_from_edges(&self, node: &Node, state: &ParserState) -> UIAction {
        let remaining = &state.input[state.cursor..];
        let prefix = &state.input[..state.cursor];
        
        // Find edges that could match with more input
        for edge in &node.edges {
            match &edge.pattern {
                EdgePattern::PrefixOf(target) => {
                    if target.starts_with(remaining) && !remaining.is_empty() {
                        // Preserve the prefix that was already typed
                        let full_completion = format!("{}{}", prefix, target);
                        return UIAction::suggest(
                            state.original_query.clone(),
                            Some(Suggestion {
                                text: full_completion.clone(),
                                completion: full_completion,
                                description: edge.description.map(|d| d.to_string()),
                                score: 1.0,
                            })
                        );
                    }
                }
                EdgePattern::Literal(lit) => {
                    if lit.starts_with(remaining) && !remaining.is_empty() {
                        let full_completion = format!("{}{}", prefix, lit);
                        return UIAction::suggest(
                            state.original_query.clone(),
                            Some(Suggestion {
                                text: full_completion.clone(),
                                completion: full_completion,
                                description: edge.description.map(|d| d.to_string()),
                                score: 1.0,
                            })
                        );
                    }
                }
                _ => {}
            }
        }
        
        UIAction::error(
            "InvalidPath".to_string(),
            format!("'{}' doesn't match any known pattern", state.original_query)
        )
    }
}

struct ParserState<'a> {
    input: &'a str,
    cursor: usize,
    current_node_id: NodeId,
    context: HashMap<String, String>,
    original_query: String,
}

// --- Helper Functions ---

fn is_valid_variable(var_name: &str, value: &str) -> bool {
    match var_name {
        "subreddit" => {
            !value.is_empty() && 
            value.len() <= 21 && 
            value.chars().all(|c| c.is_alphanumeric() || c == '_')
        }
        "username" => {
            !value.is_empty() && 
            value.len() <= 20 && 
            value.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
        }
        "post_id" => {
            !value.is_empty() && 
            value.len() <= 10 && 
            value.chars().all(|c| c.is_alphanumeric())
        }
        _ => true, // Allow any value for unknown variables
    }
}

// --- Define the Reddit Graph ---

pub fn build_reddit_graph() -> Graph {
    GraphBuilder::new()
        // === ROOT LEVEL: Direct domain/protocol patterns ===
        .at("root")
            // Reddit shortcuts - one pattern handles ALL prefixes!
            .edge_with_desc(
                EdgePattern::PrefixOf("reddit.com"), 
                "reddit_domain",
                Some("Go to Reddit")
            )
            // Short alias
            .edge(EdgePattern::Literal("r"), "reddit_slash_prefix")
            
            // Protocol patterns - "h" can suggest "https://"
            .edge_with_desc(
                EdgePattern::PrefixOf("https://"),
                "https_protocol",
                Some("HTTPS protocol")
            )
            .edge_with_desc(
                EdgePattern::PrefixOf("http://"),
                "http_protocol", 
                Some("HTTP protocol")
            )
            .edge_with_desc(
                EdgePattern::PrefixOf("www."),
                "www_prefix",
                Some("World Wide Web")
            )
        
        // === After "r" shortcut, expect "/" ===
        .at("reddit_slash_prefix")
            .edge(EdgePattern::Literal("/"), "reddit_root")
        
        // === HTTPS PROTOCOL: Can go to any domain ===
        .at("https_protocol")
            .edge_with_desc(
                EdgePattern::PrefixOf("reddit.com"),
                "reddit_domain",
                Some("Reddit (HTTPS)")
            )
            .edge_with_desc(
                EdgePattern::PrefixOf("www."),
                "https_www",
                Some("WWW prefix")
            )
        
        // === HTTP PROTOCOL: Similar to HTTPS ===
        .at("http_protocol")
            .edge_with_desc(
                EdgePattern::PrefixOf("reddit.com"),
                "reddit_domain",
                Some("Reddit (HTTP)")
            )
            .edge_with_desc(
                EdgePattern::PrefixOf("www."),
                "http_www",
                Some("WWW prefix")
            )
        
        // === HTTPS + WWW ===
        .at("https_www")
            .edge_with_desc(
                EdgePattern::PrefixOf("reddit.com"),
                "reddit_domain",
                Some("Reddit")
            )
        
        // === HTTP + WWW ===
        .at("http_www")
            .edge_with_desc(
                EdgePattern::PrefixOf("reddit.com"),
                "reddit_domain",
                Some("Reddit")
            )
        
        // === WWW PREFIX (without protocol) ===
        .at("www_prefix")
            .edge_with_desc(
                EdgePattern::PrefixOf("reddit.com"),
                "reddit_domain",
                Some("Reddit")
            )
        
        // === REDDIT DOMAIN: Expect "/" ===
        .at("reddit_domain")
            .edge(EdgePattern::Literal("/"), "reddit_root")
            .handler(|query, _ctx| {
                // If someone just types "reddit.com" (or with protocol) without slash
                // Suggest adding the slash
                let completion = if query.starts_with("https://") {
                    "https://reddit.com/".to_string()
                } else if query.starts_with("http://") {
                    "http://reddit.com/".to_string()
                } else if query.starts_with("www.") {
                    "www.reddit.com/".to_string()
                } else {
                    "reddit.com/".to_string()
                };
                
                UIAction::suggest(
                    query.to_string(),
                    Some(Suggestion {
                        text: completion.clone(),
                        completion,
                        description: Some("Go to Reddit homepage".to_string()),
                        score: 1.0,
                    })
                )
            })
        
        // === REDDIT ROOT: The main Reddit navigation ===
        .at("reddit_root")
            .edge(EdgePattern::Literal("r"), "r_prefix")
            .edge(EdgePattern::Literal("u"), "u_prefix")
            .handler(|query, _ctx| {
                UIAction::multiple(vec![
                    UIAction::suggest(query.to_string(), Some(Suggestion { 
                        text: "reddit.com/r/".to_string(),
                        completion: "reddit.com/r/".to_string(),
                        description: Some("Browse subreddits".to_string()),
                        score: 1.0,
                    })),
                    UIAction::guide(
                        query.to_string(),
                        "Welcome to Sorter for Reddit".to_string(),
                        "Where would you like to start?".to_string(),
                        vec![
                            GuideOption { 
                                key: "r".to_string(), 
                                label: "Sort a Subreddit".to_string(), 
                                description: "Find the best posts in a community.".to_string(), 
                                completion: "reddit.com/r/".to_string() 
                            },
                            GuideOption { 
                                key: "u".to_string(), 
                                label: "Sort User Content".to_string(), 
                                description: "Explore and rank a user's posts and comments.".to_string(), 
                                completion: "reddit.com/u/".to_string() 
                            },
                        ]
                    ),
                ])
            })
        
        // === /r/ - Subreddit browsing ===
        .at("r_prefix")
            .edge(EdgePattern::Literal("/"), "subreddit_selection")
        
        .at("subreddit_selection")
            .edge(EdgePattern::Variable("subreddit"), "subreddit_page")
            .handler(|query, _ctx| {
                UIAction::multiple(vec![
                    UIAction::suggest(query.to_string(), Some(Suggestion {
                        text: "reddit.com/r/programming".to_string(),
                        completion: "reddit.com/r/programming".to_string(),
                        description: Some("Popular programming community".to_string()),
                        score: 1.0,
                    })),
                    UIAction::selection(
                        query.to_string(), 
                        "Choose a Subreddit".to_string(), 
                        "Select a popular community or type a name.".to_string(), 
                        vec![
                            SelectionItem { 
                                id: "programming".to_string(), 
                                title: "r/programming".to_string(), 
                                description: Some("Computer programming discussions".to_string()),
                                completion: "reddit.com/r/programming".to_string() 
                            },
                            SelectionItem { 
                                id: "rust".to_string(), 
                                title: "r/rust".to_string(), 
                                description: Some("The Rust programming language".to_string()),
                                completion: "reddit.com/r/rust".to_string() 
                            },
                            SelectionItem { 
                                id: "webdev".to_string(), 
                                title: "r/webdev".to_string(), 
                                description: Some("Web development community".to_string()),
                                completion: "reddit.com/r/webdev".to_string() 
                            },
                        ]
                    )
                ])
            })
        
        // === Specific subreddit page ===
        .at("subreddit_page")
            .edge(EdgePattern::Literal("/"), "subreddit_slash")
            .handler(|_query, ctx| {
                let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
                // This should trigger importing/loading the subreddit
                UIAction::RenderSubredditView {
                    subreddit: subreddit.clone(),
                    sort: None,
                }
            })
        
        .at("subreddit_slash")
            .edge(EdgePattern::Literal("hot"), "subreddit_hot")
            .edge(EdgePattern::Literal("top"), "subreddit_top")
            .edge(EdgePattern::Literal("new"), "subreddit_new")
            .edge(EdgePattern::Literal("comments"), "subreddit_comments")
            .handler(|query, ctx| {
                let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
                UIAction::guide(
                    query.to_string(), 
                    format!("What to sort in r/{}?", subreddit), 
                    "Choose a category to begin sorting.".to_string(), 
                    vec![
                        GuideOption { 
                            key: "hot".to_string(), 
                            label: "Hot Posts".to_string(), 
                            description: "Import and sort posts currently on the front page.".to_string(), 
                            completion: format!("reddit.com/r/{}/hot", subreddit) 
                        },
                        GuideOption { 
                            key: "top".to_string(), 
                            label: "Top Posts".to_string(), 
                            description: "Import and sort the highest-rated posts.".to_string(), 
                            completion: format!("reddit.com/r/{}/top", subreddit) 
                        },
                        GuideOption { 
                            key: "new".to_string(), 
                            label: "New Posts".to_string(), 
                            description: "Import and sort the newest posts.".to_string(), 
                            completion: format!("reddit.com/r/{}/new", subreddit) 
                        },
                        GuideOption { 
                            key: "comments".to_string(), 
                            label: "All Comments".to_string(), 
                            description: "Find the best comment across all imported threads.".to_string(), 
                            completion: format!("reddit.com/r/{}/comments/", subreddit) 
                        },
                    ]
                )
            })
        
        // === /u/ - User profiles ===
        .at("u_prefix")
            .edge(EdgePattern::Literal("/"), "user_selection")
        
        .at("user_selection")
            .edge(EdgePattern::Variable("username"), "user_profile")
            .handler(|query, _ctx| {
                UIAction::guide(
                    query.to_string(),
                    "User Profile Sorting".to_string(),
                    "Enter a Reddit username to sort their content.".to_string(),
                    vec![
                        GuideOption {
                            key: "popular".to_string(),
                            label: "Popular Users".to_string(),
                            description: "Browse well-known Reddit users.".to_string(),
                            completion: "reddit.com/u/".to_string(),
                        },
                    ]
                )
            })
        
        // === Subreddit sort types ===
        .at("subreddit_hot")
            .handler(|_query, ctx| {
                let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
                UIAction::RenderSubredditView {
                    subreddit,
                    sort: Some("hot".to_string()),
                }
            })
        
        .at("subreddit_top")
            .handler(|_query, ctx| {
                let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
                UIAction::RenderSubredditView {
                    subreddit,
                    sort: Some("top".to_string()),
                }
            })
        
        .at("subreddit_new")
            .handler(|_query, ctx| {
                let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
                UIAction::RenderSubredditView {
                    subreddit,
                    sort: Some("new".to_string()),
                }
            })
        
        .at("subreddit_comments")
            .handler(|_query, ctx| {
                let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
                UIAction::RenderSubredditComments {
                    subreddit,
                }
            })
        
        // === User profile ===
        .at("user_profile")
            .handler(|_query, ctx| {
                let username = ctx.get("username").cloned().unwrap_or_default();
                UIAction::RenderUserProfile {
                    username,
                }
            })
        
        // === Build the graph ===
        .build()
}

// --- Public API ---

/// Parse a query string and return a UI action
pub fn parse_reddit_url(query: &str) -> UIAction {
    let graph = build_reddit_graph();
    graph.parse(query)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Represents a keystroke action
    #[derive(Debug, Clone, PartialEq)]
    enum KeyAction {
        Type(String),  // Type characters
        Tab,           // Press tab (accept completion)
        Enter,         // Press enter
    }

    /// Expected state after a keystroke
    #[derive(Debug, Clone)]
    enum ExpectedAction {
        Suggestion { completion: String },
        Guide { title_contains: String },
        Selection { title_contains: String },
        RenderSubreddit { subreddit: String, sort: Option<String> },
        RenderUser { username: String },
        Error { error_type: String },
        Multiple,  // Multiple responses (guide + suggestions)
        Home,
    }

    impl ExpectedAction {
        fn matches(&self, action: &UIAction) -> bool {
            match (self, action) {
                (ExpectedAction::Suggestion { completion }, UIAction::ShowSuggestions(data)) => {
                    data.suggestion.as_ref()
                        .map(|s| s.completion == *completion)
                        .unwrap_or(false)
                }
                (ExpectedAction::Guide { title_contains }, UIAction::ShowStaticGuide { title, .. }) => {
                    title.contains(title_contains)
                }
                (ExpectedAction::Selection { title_contains }, UIAction::ShowStaticSelection { title, .. }) => {
                    title.contains(title_contains)
                }
                (ExpectedAction::RenderSubreddit { subreddit, sort }, 
                 UIAction::RenderSubredditView { subreddit: s, sort: so }) => {
                    s == subreddit && so == sort
                }
                (ExpectedAction::RenderUser { username }, UIAction::RenderUserProfile { username: u }) => {
                    u == username
                }
                (ExpectedAction::Error { error_type }, UIAction::ShowError(data)) => {
                    data.error_type == *error_type
                }
                (ExpectedAction::Multiple, UIAction::ShowMultiple { .. }) => true,
                (ExpectedAction::Home, UIAction::ShowHomePage { .. }) => true,
                _ => false,
            }
        }
    }

    /// Test helper to simulate a sequence of keystrokes
    fn simulate_keystrokes(actions: Vec<KeyAction>) -> Vec<(String, UIAction)> {
        let graph = build_reddit_graph();
        let mut current_text = String::new();
        let mut results = Vec::new();
        
        for action in actions {
            match action {
                KeyAction::Type(text) => {
                    current_text.push_str(&text);
                    let result = graph.parse(&current_text);
                    results.push((current_text.clone(), result));
                }
                KeyAction::Tab => {
                    // Tab accepts the current suggestion if there is one
                    let result = graph.parse(&current_text);
                    if let UIAction::ShowSuggestions(ref data) = result {
                        if let Some(ref suggestion) = data.suggestion {
                            current_text = suggestion.completion.clone();
                            let new_result = graph.parse(&current_text);
                            results.push((current_text.clone(), new_result));
                        }
                    }
                }
                KeyAction::Enter => {
                    // Enter submits the current text
                    let result = graph.parse(&current_text);
                    results.push((format!("{}[ENTER]", current_text), result));
                }
            }
        }
        
        results
    }

    /// Test a flow using declarative (KeyAction, ExpectedAction) tuples
    fn test_flow(name: &str, flow: Vec<(KeyAction, ExpectedAction)>) {
        let graph = build_reddit_graph();
        let mut current_text = String::new();
        
        println!("\n=== Flow: {} ===", name);
        
        for (i, (key_action, expected)) in flow.iter().enumerate() {
            // Perform the keystroke
            match key_action {
                KeyAction::Type(text) => {
                    current_text.push_str(text);
                }
                KeyAction::Tab => {
                    // Tab accepts the current suggestion
                    let result = graph.parse(&current_text);
                    if let UIAction::ShowSuggestions(data) = result {
                        if let Some(suggestion) = &data.suggestion {
                            current_text = suggestion.completion.clone();
                        }
                    }
                }
                KeyAction::Enter => {
                    // Enter submits current text (no change needed for testing)
                }
            }
            
            // Check the result
            let actual_action = graph.parse(&current_text);
            
            println!("  Step {}: {:?} -> '{}' -> {:?}", 
                     i + 1, key_action, current_text, actual_action);
            
            assert!(
                expected.matches(&actual_action),
                "Flow '{}' failed at step {}\n  Expected: {:?}\n  Actual: {:?}\n  Text: '{}'",
                name, i + 1, expected, actual_action, current_text
            );
        }
        
        println!("✓ Flow '{}' passed!", name);
    }
    
    /// Legacy helper for backward compatibility (will be removed)
    fn assert_flow(
        name: &str,
        actions: Vec<KeyAction>,
        expected_checks: Vec<Box<dyn Fn(&str, &UIAction) -> bool>>,
    ) {
        let results = simulate_keystrokes(actions);
        
        println!("\n=== Flow: {} ===", name);
        for (i, (text, action)) in results.iter().enumerate() {
            println!("  Step {}: '{}' -> {:?}", i + 1, text, action);
            
            if i < expected_checks.len() {
                let check = &expected_checks[i];
                assert!(
                    check(text, action),
                    "Flow '{}' failed at step {} with text '{}' and action {:?}",
                    name, i + 1, text, action
                );
            }
        }
        println!("✓ Flow '{}' passed!", name);
    }

    #[test]
    fn test_https_reddit_tab_flow() {
        // Test: typing "https://reddit.com" and pressing tab should give "https://reddit.com/"
        assert_flow(
            "HTTPS Reddit with Tab",
            vec![
                KeyAction::Type("https://reddit.com".to_string()),
                KeyAction::Tab,
            ],
            vec![
                Box::new(|text, action| {
                    // After typing "https://reddit.com", should get a suggestion
                    text == "https://reddit.com" && matches!(action, UIAction::ShowSuggestions(data) if 
                        data.suggestion.as_ref().map(|s| s.completion == "https://reddit.com/").unwrap_or(false)
                    )
                }),
                Box::new(|text, action| {
                    // After tab, should have "https://reddit.com/" and show guide
                    text == "https://reddit.com/" && matches!(action, UIAction::ShowMultiple { .. })
                }),
            ],
        );
    }

    #[test]
    fn test_quick_subreddit_flow() {
        // Test: "r" -> TAB -> "/r/" -> "rust"
        // Note: After tab completion, we need to clear and type the full path
        assert_flow(
            "Quick Subreddit Access",
            vec![
                KeyAction::Type("r".to_string()),
                KeyAction::Tab,
                KeyAction::Type("/r/rust".to_string()),  // Append to "reddit.com"
            ],
            vec![
                Box::new(|text, action| {
                    // "r" should suggest "reddit.com"
                    text == "r" && matches!(action, UIAction::ShowSuggestions(data) if 
                        data.suggestion.as_ref().map(|s| s.completion == "reddit.com").unwrap_or(false)
                    )
                }),
                Box::new(|text, action| {
                    // After tab, should have "reddit.com"
                    text == "reddit.com" && matches!(action, UIAction::ShowSuggestions(_))
                }),
                Box::new(|text, action| {
                    // "reddit.com/r/rust" should render the subreddit
                    text == "reddit.com/r/rust" && matches!(action, UIAction::RenderSubredditView { subreddit, .. } if subreddit == "rust")
                }),
            ],
        );
    }

    #[test]
    fn test_progressive_completion_flow() {
        // Test progressive typing: "r" -> "re" -> "red" -> "redd" -> "reddit" -> TAB
        let progressive_actions = vec![
            KeyAction::Type("r".to_string()),
            KeyAction::Type("e".to_string()),
            KeyAction::Type("d".to_string()),
            KeyAction::Type("d".to_string()),
            KeyAction::Type("i".to_string()),
            KeyAction::Type("t".to_string()),
            KeyAction::Tab,
        ];
        
        let results = simulate_keystrokes(progressive_actions);
        
        println!("\n=== Progressive Completion Flow ===");
        for (text, action) in &results {
            println!("  '{}' -> {:?}", text, action);
            
            // Each step before tab should suggest "reddit.com"
            if !text.contains("reddit.com") {
                match action {
                    UIAction::ShowSuggestions(data) => {
                        assert_eq!(
                            data.suggestion.as_ref().unwrap().completion,
                            "reddit.com",
                            "Should suggest reddit.com at '{}'", text
                        );
                    }
                    _ => panic!("Expected suggestion at '{}'", text),
                }
            }
        }
        
        // After tab, should have "reddit.com"
        let (final_text, _) = results.last().unwrap();
        assert_eq!(final_text, "reddit.com");
        println!("✓ Progressive completion flow passed!");
    }

    #[test]
    fn test_subreddit_sort_flow() {
        // Test navigating to a subreddit and choosing a sort option
        assert_flow(
            "Subreddit Sort Navigation",
            vec![
                KeyAction::Type("reddit.com/r/programming/hot".to_string()),
            ],
            vec![
                Box::new(|text, action| {
                    text == "reddit.com/r/programming/hot" && 
                    matches!(action, UIAction::RenderSubredditView { subreddit, sort } 
                        if subreddit == "programming" && sort.as_deref() == Some("hot"))
                }),
            ],
        );
    }

    #[test]
    fn test_user_profile_flow() {
        // Test navigating to a user profile
        assert_flow(
            "User Profile Navigation",
            vec![
                KeyAction::Type("reddit.com/u/spez".to_string()),
            ],
            vec![
                Box::new(|text, action| {
                    text == "reddit.com/u/spez" && 
                    matches!(action, UIAction::RenderUserProfile { username } if username == "spez")
                }),
            ],
        );
    }

    #[test]
    fn test_alias_shortcut_flow() {
        // Test using the "r/" shortcut
        assert_flow(
            "Alias Shortcut",
            vec![
                KeyAction::Type("r/".to_string()),
                KeyAction::Type("r/".to_string()),
                KeyAction::Type("technology".to_string()),
            ],
            vec![
                Box::new(|text, _| text == "r/"),
                Box::new(|text, _| text == "r/r/"),
                Box::new(|text, action| {
                    text == "r/r/technology" && 
                    matches!(action, UIAction::RenderSubredditView { subreddit, .. } if subreddit == "technology")
                }),
            ],
        );
    }

    #[test]
    fn test_www_prefix_flow() {
        // Test with www prefix
        assert_flow(
            "WWW Prefix",
            vec![
                KeyAction::Type("www.reddit.com".to_string()),
                KeyAction::Tab,
            ],
            vec![
                Box::new(|text, action| {
                    // Should suggest adding slash
                    text == "www.reddit.com" && matches!(action, UIAction::ShowSuggestions(data) if 
                        data.suggestion.as_ref().map(|s| s.completion == "www.reddit.com/").unwrap_or(false)
                    )
                }),
                Box::new(|text, action| {
                    // After tab, should show guide
                    text == "www.reddit.com/" && matches!(action, UIAction::ShowMultiple { .. })
                }),
            ],
        );
    }

    #[test]
    fn test_invalid_path_handling() {
        // Test that invalid paths show errors
        assert_flow(
            "Invalid Path",
            vec![
                KeyAction::Type("reddit.com/invalid/path".to_string()),
            ],
            vec![
                Box::new(|text, action| {
                    text == "reddit.com/invalid/path" && 
                    matches!(action, UIAction::ShowError(_))
                }),
            ],
        );
    }

    #[test]
    fn test_complete_user_journey() {
        // Test a complete user journey: type partial URL, tab complete, navigate to subreddit
        assert_flow(
            "Complete User Journey",
            vec![
                KeyAction::Type("http".to_string()),
                KeyAction::Type("s://r".to_string()),
                KeyAction::Tab,
                KeyAction::Type("/".to_string()),
                KeyAction::Type("r/".to_string()),
                KeyAction::Type("programming".to_string()),
                KeyAction::Type("/".to_string()),
                KeyAction::Type("top".to_string()),
            ],
            vec![
                Box::new(|text, action| {
                    // "http" should suggest "https://"
                    text == "http" && matches!(action, UIAction::ShowSuggestions(data) if 
                        data.suggestion.as_ref().map(|s| s.completion == "https://").unwrap_or(false)
                    )
                }),
                Box::new(|text, action| {
                    // "https://r" should suggest "https://reddit.com"
                    text == "https://r" && matches!(action, UIAction::ShowSuggestions(data) if 
                        data.suggestion.as_ref().map(|s| s.completion == "https://reddit.com").unwrap_or(false)
                    )
                }),
                Box::new(|text, action| {
                    // After tab, should have "https://reddit.com"
                    text == "https://reddit.com" && matches!(action, UIAction::ShowSuggestions(_))
                }),
                Box::new(|text, action| {
                    // "https://reddit.com/" should show guide
                    text == "https://reddit.com/" && matches!(action, UIAction::ShowMultiple { .. })
                }),
                Box::new(|text, action| {
                    // "https://reddit.com/r/" should show subreddit selection
                    text == "https://reddit.com/r/" && matches!(action, UIAction::ShowMultiple { .. })
                }),
                Box::new(|text, action| {
                    // "https://reddit.com/r/programming" should render subreddit
                    text == "https://reddit.com/r/programming" && 
                    matches!(action, UIAction::RenderSubredditView { subreddit, sort } 
                        if subreddit == "programming" && sort.is_none())
                }),
                Box::new(|text, action| {
                    // "https://reddit.com/r/programming/" should show sort options
                    text == "https://reddit.com/r/programming/" && 
                    matches!(action, UIAction::ShowStaticGuide { .. })
                }),
                Box::new(|text, action| {
                    // "https://reddit.com/r/programming/top" should render with top sort
                    text == "https://reddit.com/r/programming/top" && 
                    matches!(action, UIAction::RenderSubredditView { subreddit, sort } 
                        if subreddit == "programming" && sort.as_deref() == Some("top"))
                }),
            ],
        );
    }

    #[test]
    fn test_multiple_tab_completions() {
        // Test multiple tab completions in sequence
        let actions = vec![
            KeyAction::Type("h".to_string()),
            KeyAction::Tab,  // Complete to "https://"
            KeyAction::Type("r".to_string()),
            KeyAction::Tab,  // Complete to "https://reddit.com"
            KeyAction::Type("/".to_string()),
        ];
        
        let results = simulate_keystrokes(actions);
        
        println!("\n=== Multiple Tab Completions ===");
        for (i, (text, _action)) in results.iter().enumerate() {
            println!("  Step {}: '{}'", i + 1, text);
        }
        
        // Verify the final state
        assert_eq!(results[1].0, "https://");  // After first tab
        assert_eq!(results[3].0, "https://reddit.com");  // After second tab
        assert_eq!(results[4].0, "https://reddit.com/");  // After typing /
        
        println!("✓ Multiple tab completions work correctly!");
    }

    // === CONVENIENCE MACROS FOR CLEANER TESTS ===
    
    macro_rules! flow {
        ($(($key:expr, $expected:expr)),* $(,)?) => {
            vec![$(($key, $expected)),*]
        };
    }
    
    macro_rules! type_text {
        ($text:expr) => {
            KeyAction::Type($text.to_string())
        };
    }
    
    macro_rules! suggests {
        ($completion:expr) => {
            ExpectedAction::Suggestion { completion: $completion.to_string() }
        };
    }
    
    macro_rules! renders_subreddit {
        ($subreddit:expr) => {
            ExpectedAction::RenderSubreddit { subreddit: $subreddit.to_string(), sort: None }
        };
        ($subreddit:expr, $sort:expr) => {
            ExpectedAction::RenderSubreddit { 
                subreddit: $subreddit.to_string(), 
                sort: Some($sort.to_string()) 
            }
        };
    }

    // === NEW DECLARATIVE TESTS ===

    #[test]
    fn test_declarative_https_tab_flow() {
        test_flow("HTTPS Tab Completion", vec![
            (KeyAction::Type("https://reddit.com".to_string()), 
             ExpectedAction::Suggestion { completion: "https://reddit.com/".to_string() }),
            (KeyAction::Tab, 
             ExpectedAction::Multiple),
        ]);
    }

    #[test]
    fn test_declarative_quick_subreddit_flow() {
        test_flow("Quick Subreddit Flow", vec![
            (KeyAction::Type("r".to_string()), 
             ExpectedAction::Suggestion { completion: "reddit.com".to_string() }),
            (KeyAction::Tab, 
             ExpectedAction::Suggestion { completion: "reddit.com/".to_string() }),
            (KeyAction::Type("/r/rust".to_string()),
             ExpectedAction::RenderSubreddit { subreddit: "rust".to_string(), sort: None }),
        ]);
    }

    #[test]
    fn test_declarative_complete_journey() {
        test_flow("Complete User Journey", vec![
            (KeyAction::Type("http".to_string()),
             ExpectedAction::Suggestion { completion: "https://".to_string() }),
            (KeyAction::Type("s://r".to_string()),
             ExpectedAction::Suggestion { completion: "https://reddit.com".to_string() }),
            (KeyAction::Tab,
             ExpectedAction::Suggestion { completion: "https://reddit.com/".to_string() }),
            (KeyAction::Type("/r/programming/top".to_string()),
             ExpectedAction::RenderSubreddit { 
                 subreddit: "programming".to_string(), 
                 sort: Some("top".to_string()) 
             }),
        ]);
    }

    #[test]
    fn test_declarative_user_profile() {
        test_flow("User Profile Navigation", vec![
            (KeyAction::Type("reddit.com/u/spez".to_string()),
             ExpectedAction::RenderUser { username: "spez".to_string() }),
        ]);
    }

    #[test]
    fn test_declarative_error_handling() {
        test_flow("Error Handling", vec![
            (KeyAction::Type("reddit.com/invalid/path".to_string()),
             ExpectedAction::Error { error_type: "InvalidPath".to_string() }),
        ]);
    }

    #[test]
    fn test_declarative_progressive_completion() {
        test_flow("Progressive Completion", vec![
            (KeyAction::Type("r".to_string()),
             ExpectedAction::Suggestion { completion: "reddit.com".to_string() }),
            (KeyAction::Type("e".to_string()),
             ExpectedAction::Suggestion { completion: "reddit.com".to_string() }),
            (KeyAction::Type("d".to_string()),
             ExpectedAction::Suggestion { completion: "reddit.com".to_string() }),
            (KeyAction::Type("dit".to_string()),
             ExpectedAction::Suggestion { completion: "reddit.com".to_string() }),
            (KeyAction::Tab,
             ExpectedAction::Suggestion { completion: "reddit.com/".to_string() }),
        ]);
    }

    #[test]
    fn test_declarative_subreddit_guide() {
        test_flow("Subreddit Guide", vec![
            (KeyAction::Type("reddit.com/r/programming/".to_string()),
             ExpectedAction::Guide { title_contains: "What to sort".to_string() }),
        ]);
    }

    #[test]
    fn test_clean_macro_example() {
        // This is what the tests can look like with macros!
        test_flow("Clean Macro Example", flow![
            (type_text!("r"), suggests!("reddit.com")),
            (KeyAction::Tab, suggests!("reddit.com/")),
            (type_text!("/r/rust/hot"), renders_subreddit!("rust", "hot")),
        ]);
    }

    #[test]
    fn test_ultra_clean_user_journey() {
        test_flow("Ultra Clean User Journey", flow![
            (type_text!("h"), suggests!("https://")),
            (type_text!("ttps://r"), suggests!("https://reddit.com")), 
            (KeyAction::Tab, suggests!("https://reddit.com/")),
            (type_text!("/u/spez"), ExpectedAction::RenderUser { username: "spez".to_string() }),
        ]);
    }

    // Keep the original tests as well
    #[test]
    fn test_reddit_prefix_autocomplete() {
        let graph = build_reddit_graph();
        
        // Test various prefixes
        let prefixes = vec!["r", "re", "red", "redd", "reddi", "reddit", "reddit.", "reddit.c", "reddit.co"];
        
        for prefix in prefixes {
            match graph.parse(prefix) {
                UIAction::ShowSuggestions(data) => {
                    assert_eq!(data.suggestion.as_ref().unwrap().completion, "reddit.com");
                    println!("✓ '{}' → reddit.com", prefix);
                }
                _ => panic!("Expected suggestion for '{}'", prefix),
            }
        }
    }
    
    #[test]
    fn test_protocol_composition() {
        let graph = build_reddit_graph();
        
        // Test protocol + reddit compositions
        let tests = vec![
            ("https://r", "https://reddit.com"),
            ("https://re", "https://reddit.com"),
            ("https://reddit", "https://reddit.com"),
            ("https://www.r", "https://www.reddit.com"),
            ("https://www.reddit", "https://www.reddit.com"),
            ("http://r", "http://reddit.com"),
            ("www.r", "www.reddit.com"),
        ];
        
        for (input, expected) in tests {
            match graph.parse(input) {
                UIAction::ShowSuggestions(data) => {
                    assert_eq!(data.suggestion.as_ref().unwrap().completion, expected);
                    println!("✓ '{}' → {}", input, expected);
                }
                _ => panic!("Expected suggestion for '{}'", input),
            }
        }
    }
    
    #[test]
    fn test_alias_and_full_paths() {
        let graph = build_reddit_graph();
        
        // Both should work the same
        let paths = vec![
            "reddit.com/",
            "r/",
        ];
        
        for path in paths {
            match graph.parse(path) {
                UIAction::ShowMultiple { actions } => {
                    let has_guide = actions.iter()
                        .any(|a| matches!(a, UIAction::ShowStaticGuide { .. }));
                    assert!(has_guide, "Path '{}' should show guide", path);
                    println!("✓ '{}' shows Reddit root guide", path);
                }
                _ => panic!("Expected Multiple action for '{}'", path),
            }
        }
    }
    
    #[test]
    fn test_deep_navigation() {
        let graph = build_reddit_graph();
        
        // Test navigation to subreddit
        match graph.parse("reddit.com/r/rust") {
            UIAction::RenderSubredditView { subreddit, sort } => {
                assert_eq!(subreddit, "rust");
                assert_eq!(sort, None);
                println!("✓ reddit.com/r/rust recognized");
            }
            _ => panic!("Expected RenderSubredditView for subreddit"),
        }
        
        // Test with alias
        match graph.parse("r/r/programming") {
            UIAction::RenderSubredditView { subreddit, sort } => {
                assert_eq!(subreddit, "programming");
                assert_eq!(sort, None);
                println!("✓ r/r/programming (alias) recognized");
            }
            _ => panic!("Expected RenderSubredditView for subreddit via alias"),
        }
    }
}
