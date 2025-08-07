use std::collections::HashMap;
use std::rc::Rc;
use std::cell::RefCell;
use crate::ui::types::{UIResponse, Suggestion, GuideOption, SelectionItem};

// --- Data Structures ---

/// A handler for when a path is fully matched. Generates the main UI.
type ExactMatchHandler = fn(query: &str, context: &HashMap<String, String>) -> UIResponse;

/// A handler for when a user's input is a partial match for one of this node's children.
type PartialMatchHandler = fn(query: &str, partial_segment: &str, parent_node: &UINode, context: &HashMap<String, String>) -> UIResponse;

#[derive(Default)]
pub struct NodeHandlers {
    pub on_exact_match: Option<ExactMatchHandler>,
    pub on_partial_match: Option<PartialMatchHandler>,
}

/// A node in our UI Graph. Represents a segment of a URL.
/// Using Rc<RefCell<>> to allow shared mutable references
pub struct UINode {
    /// Literal children, e.g., "r", "comments", "hot".
    pub children: HashMap<String, Rc<RefCell<UINode>>>,
    /// A special child for a single variable segment, e.g., "<subreddit>".
    pub variable_child: Option<(String, Rc<RefCell<UINode>>)>,
    /// The functions that generate UI responses for this specific path.
    pub handlers: NodeHandlers,
}

impl Default for UINode {
    fn default() -> Self {
        UINode {
            children: HashMap::new(),
            variable_child: None,
            handlers: NodeHandlers::default(),
        }
    }
}

/// Builder for constructing the UI graph with shared nodes
pub struct UIGraphBuilder {
    /// Registry of named nodes that can be referenced multiple times
    node_registry: HashMap<String, Rc<RefCell<UINode>>>,
    /// Platform roots (entry points into the graph)
    platforms: HashMap<String, Rc<RefCell<UINode>>>,
    /// Maps common prefixes to their full platform names
    platform_prefixes: HashMap<String, String>,
}

impl UIGraphBuilder {
    pub fn new() -> Self {
        UIGraphBuilder {
            node_registry: HashMap::new(),
            platforms: HashMap::new(),
            platform_prefixes: HashMap::new(),
        }
    }
    
    /// Create or get a named node
    pub fn node(&mut self, name: &str) -> Rc<RefCell<UINode>> {
        self.node_registry.entry(name.to_string())
            .or_insert_with(|| Rc::new(RefCell::new(UINode::default())))
            .clone()
    }
    
    /// Create a new anonymous node
    pub fn new_node() -> Rc<RefCell<UINode>> {
        Rc::new(RefCell::new(UINode::default()))
    }
    
    /// Set handlers for a node
    pub fn set_handlers(
        &mut self,
        node_name: &str,
        on_exact: Option<ExactMatchHandler>,
        on_partial: Option<PartialMatchHandler>,
    ) {
        let node = self.node(node_name);
        let mut node_ref = node.borrow_mut();
        node_ref.handlers.on_exact_match = on_exact;
        node_ref.handlers.on_partial_match = on_partial;
    }
    
    /// Add a literal child to a node
    pub fn add_child(&mut self, parent_name: &str, segment: &str, child: Rc<RefCell<UINode>>) {
        let parent = self.node(parent_name);
        parent.borrow_mut().children.insert(segment.to_string(), child);
    }
    
    /// Add a named child (from registry) to a node
    pub fn add_named_child(&mut self, parent_name: &str, segment: &str, child_name: &str) {
        let child = self.node(child_name);
        self.add_child(parent_name, segment, child);
    }
    
    /// Set a variable child for a node
    pub fn set_variable_child(&mut self, parent_name: &str, var_name: &str, child: Rc<RefCell<UINode>>) {
        let parent = self.node(parent_name);
        parent.borrow_mut().variable_child = Some((var_name.to_string(), child));
    }
    
    /// Add a platform entry point (can add multiple aliases for the same node)
    pub fn add_platform(&mut self, platform_url: &str, root_node_name: &str) {
        let node = self.node(root_node_name);
        self.platforms.insert(platform_url.to_string(), node);
    }
    
    /// Add a platform prefix mapping
    pub fn add_platform_prefix(&mut self, prefix: &str, platform: &str) {
        self.platform_prefixes.insert(prefix.to_string(), platform.to_string());
    }
    
    /// Build the final UITrie
    pub fn build(self) -> UITrie {
        UITrie {
            platforms: self.platforms,
            platform_prefixes: self.platform_prefixes,
        }
    }
}

/// The root of our UI parsing system.
pub struct UITrie {
    platforms: HashMap<String, Rc<RefCell<UINode>>>,
    /// Maps common prefixes to their full platform names
    platform_prefixes: HashMap<String, String>,
}

// --- Trie Traversal Logic ---

impl UITrie {
    /// The main entry point for parsing a user's query.
    pub fn parse(&self, query: &str) -> UIResponse {
        let normalized = normalize_input(query);

        // Handle empty or root-level prefixes using trie's data
        if !normalized.contains('/') {
            return self.handle_platform_prefix(&normalized, query);
        }

        let (platform, path) = split_query(&normalized);
        let segments: Vec<&str> = if path.is_empty() { 
            vec![] 
        } else { 
            path.split('/').filter(|s| !s.is_empty()).collect() 
        };

        let Some(root_node) = self.platforms.get(platform) else {
            return UIResponse::error(
                "UnsupportedPlatform".to_string(), 
                format!("Platform '{}' is not yet supported. Currently only Reddit URLs are supported.", platform)
            );
        };

        let mut context = HashMap::new();
        self.traverse(root_node.clone(), &segments, &mut context, query)
    }
    
    /// Handle platform prefix matching using trie's platform data
    fn handle_platform_prefix(&self, prefix: &str, original_query: &str) -> UIResponse {
        // Simple logic: check platform prefixes first, then direct matches, then URL prefixes
        
        // First check if this is a registered prefix (e.g., "r" -> "reddit.com")
        if let Some(platform_name) = self.platform_prefixes.get(prefix) {
            return UIResponse::suggestions(
                original_query.to_string(),
                Some(Suggestion {
                    text: format!("{}/", platform_name),
                    completion: format!("{}/", platform_name),
                    description: Some(format!("Go to {} homepage", 
                        platform_name.strip_suffix(".com").unwrap_or(platform_name))),
                    score: 1.0,
                })
            );
        }
        
        // Check for common URL prefixes
        let url_prefixes = [
            ("h", "http://", "HTTP protocol"),
            ("ht", "http://", "HTTP protocol"),
            ("htt", "http://", "HTTP protocol"),
            ("http", "http://", "HTTP protocol"),
            ("https", "https://", "HTTPS protocol"),
            ("w", "www.", "World Wide Web"),
            ("ww", "www.", "World Wide Web"),
            ("www", "www.", "World Wide Web"),
        ];
        
        for (prefix_match, completion, description) in &url_prefixes {
            if prefix_match == &prefix {
                return UIResponse::suggestions(
                    original_query.to_string(),
                    Some(Suggestion {
                        text: completion.to_string(),
                        completion: completion.to_string(),
                        description: Some(description.to_string()),
                        score: 1.0,
                    })
                );
            }
        }
        
        // Then check for direct platform matches
        for platform in self.platforms.keys() {
            if platform.starts_with(prefix) {
                return UIResponse::suggestions(
                    original_query.to_string(),
                    Some(Suggestion {
                        text: format!("{}/", platform),
                        completion: format!("{}/", platform),
                        description: Some(format!("Go to {} homepage", 
                            platform.strip_suffix(".com").unwrap_or(platform))),
                        score: 1.0,
                    })
                );
            }
        }
        
        UIResponse::error(
            "UnknownPrefix".to_string(),
            format!("'{}' doesn't match any supported platform.", prefix)
        )
    }

    /// Recursively traverses the Graph based on URL segments.
    fn traverse(
        &self,
        node: Rc<RefCell<UINode>>,
        segments: &[&str],
        context: &mut HashMap<String, String>,
        query: &str
    ) -> UIResponse {
        let node_ref = node.borrow();
        
        // Base case: We have consumed all segments.
        if segments.is_empty() {
            return node_ref.handlers.on_exact_match
                .map(|f| f(query, context))
                .unwrap_or_else(|| UIResponse::error("InvalidPath".into(), "This path is incomplete.".into()));
        }

        let current_segment = segments[0];
        let remaining_segments = &segments[1..];

        // --- Try to match the current segment ---

        // 1. Try to match a literal child (e.g., "r", "comments").
        if let Some(child_node) = node_ref.children.get(current_segment) {
            let child_clone = child_node.clone();
            drop(node_ref); // Release borrow before recursive call
            return self.traverse(child_clone, remaining_segments, context, query);
        }

        // 2. Try to match a variable child (e.g., "<subreddit>").
        if let Some((var_name, child_node)) = &node_ref.variable_child {
            // Validate the variable if needed
            if is_valid_segment(var_name, current_segment) {
                context.insert(var_name.clone(), current_segment.to_string());
                let child_clone = child_node.clone();
                drop(node_ref); // Release borrow before recursive call
                return self.traverse(child_clone, remaining_segments, context, query);
            }
        }

        // --- No full match found, handle as a partial match or error ---

        // If this is the last segment, it's a partial match.
        if remaining_segments.is_empty() {
            // We need to pass the node itself to the handler, but we can't move it
            // So we'll need to adjust the handler signature or create a temporary UINode view
            // For now, let's create a simplified approach
            if let Some(handler) = node_ref.handlers.on_partial_match {
                // Create a temporary UINode for the handler (this is a limitation we need to address)
                let temp_node = UINode {
                    children: HashMap::new(), // We could copy keys if needed
                    variable_child: None,
                    handlers: NodeHandlers::default(),
                };
                return handler(query, current_segment, &temp_node, context);
            }
            return UIResponse::error("InvalidPath".into(), format!("'{}' is not a valid path.", query));
        }
        
        // If it's not the last segment and no match was found, the path is invalid.
        UIResponse::error("InvalidPath".into(), format!("'{}' contains an invalid segment.", query))
    }
}

// --- Declarative Graph Definition using Builder ---

pub fn build_ui_graph() -> UITrie {
    let mut builder = UIGraphBuilder::new();
    
    // Create the Reddit root node and set its handlers
    builder.set_handlers(
        "reddit_root",
        Some(ui_reddit_root_guide),
        Some(suggest_root_children),
    );
    
    // Create the /r/ node
    builder.set_handlers(
        "reddit_r",
        Some(ui_subreddit_selection),
        Some(suggest_subreddit_from_api),
    );
    
    // Connect reddit_root -> "r" -> reddit_r
    builder.add_named_child("reddit_root", "r", "reddit_r");
    
    // Create the /u/ node
    builder.set_handlers(
        "reddit_u",
        Some(ui_user_selection),
        Some(suggest_username_from_api),
    );
    
    // Connect reddit_root -> "u" -> reddit_u
    builder.add_named_child("reddit_root", "u", "reddit_u");
    
    // Create subreddit-specific node
    let subreddit_node = UIGraphBuilder::new_node();
    {
        let mut node_ref = subreddit_node.borrow_mut();
        node_ref.handlers.on_exact_match = Some(ui_subreddit_view_guide);
        node_ref.handlers.on_partial_match = Some(suggest_subreddit_children);
        
        // Add subreddit children
        let mut children = HashMap::new();
        
        // Comments node
        let comments_node = UIGraphBuilder::new_node();
        {
            let mut comments_ref = comments_node.borrow_mut();
            comments_ref.handlers.on_exact_match = Some(ui_import_thread_view);
            comments_ref.handlers.on_partial_match = Some(suggest_post_id_from_api);
            
            // Add post_id variable child
            let post_node = UIGraphBuilder::new_node();
            post_node.borrow_mut().handlers.on_exact_match = Some(ui_specific_comment_thread);
            comments_ref.variable_child = Some(("post_id".to_string(), post_node));
        }
        children.insert("comments".to_string(), comments_node);
        
        // Hot posts node
        let hot_node = UIGraphBuilder::new_node();
        hot_node.borrow_mut().handlers.on_exact_match = Some(ui_import_hot_posts);
        children.insert("hot".to_string(), hot_node);
        
        // Top posts node
        let top_node = UIGraphBuilder::new_node();
        top_node.borrow_mut().handlers.on_exact_match = Some(ui_import_top_posts);
        children.insert("top".to_string(), top_node);
        
        // New posts node
        let new_node = UIGraphBuilder::new_node();
        new_node.borrow_mut().handlers.on_exact_match = Some(ui_import_new_posts);
        children.insert("new".to_string(), new_node);
        
        node_ref.children = children;
    }
    
    // Set the subreddit variable child for reddit_r
    builder.set_variable_child("reddit_r", "subreddit", subreddit_node);
    
    // Create user profile node
    let user_node = UIGraphBuilder::new_node();
    user_node.borrow_mut().handlers.on_exact_match = Some(ui_user_profile_view);
    
    // Set the username variable child for reddit_u
    builder.set_variable_child("reddit_u", "username", user_node);
    
    // NOW THE KEY PART: Add multiple entry points to the same node!
    builder.add_platform("reddit.com", "reddit_root");
    builder.add_platform("r", "reddit_root");            // Short alias
    
    // Add platform prefixes for autocomplete
    for prefix in &["r", "re", "red", "redd", "reddi", "reddit"] {
        builder.add_platform_prefix(prefix, "reddit.com");
    }
    
    builder.build()
}

// --- Helper Functions (unchanged) ---

fn normalize_input(input: &str) -> String {
    let mut normalized = input.trim().to_lowercase();
    
    // Strip protocols
    for protocol in &["https://", "http://"] {
        if normalized.starts_with(protocol) {
            normalized = normalized[protocol.len()..].to_string();
            break;
        }
    }
    
    // Strip www.
    if normalized.starts_with("www.") {
        normalized = normalized[4..].to_string();
    }
    
    normalized
}

fn split_query(normalized_input: &str) -> (&str, &str) {
    if let Some(slash_pos) = normalized_input.find('/') {
        let (domain, path) = normalized_input.split_at(slash_pos);
        // Trim the leading '/' from the path. If path was just "/", this becomes "".
        (domain, path.strip_prefix('/').unwrap_or(path))
    } else {
        // Handle cases like "reddit.com" with no slash
        (normalized_input, "")
    }
}

fn is_valid_segment(var_name: &str, segment: &str) -> bool {
    match var_name {
        "subreddit" => is_valid_subreddit_name(segment),
        "username" => is_valid_username(segment),
        "post_id" => is_valid_post_id(segment),
        _ => true, // Allow any segment for unknown variable types
    }
}

fn is_valid_subreddit_name(name: &str) -> bool {
    !name.is_empty() && 
    name.len() <= 21 && 
    name.chars().all(|c| c.is_alphanumeric() || c == '_')
}

fn is_valid_username(name: &str) -> bool {
    !name.is_empty() && 
    name.len() <= 20 && 
    name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

fn is_valid_post_id(id: &str) -> bool {
    !id.is_empty() && 
    id.len() <= 10 && 
    id.chars().all(|c| c.is_alphanumeric())
}

fn generate_random_post_id() -> String {
    // Generate a random-looking post ID for demonstration
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let mut hasher = DefaultHasher::new();
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos().hash(&mut hasher);
    format!("{:x}", hasher.finish()).chars().take(6).collect()
}

// --- UI Handler Implementations (these remain the same) ---

fn ui_reddit_root_guide(query: &str, _ctx: &HashMap<String, String>) -> UIResponse {
    UIResponse::multiple(vec![
        UIResponse::suggestions(query.to_string(), Some(Suggestion { 
            text: "reddit.com/r/".to_string(),
            completion: "reddit.com/r/".to_string(),
            description: Some("Browse subreddits".to_string()),
            score: 1.0,
        })),
        UIResponse::guide(
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
}

fn ui_subreddit_selection(query: &str, _ctx: &HashMap<String, String>) -> UIResponse {
    UIResponse::multiple(vec![
        UIResponse::suggestions(query.to_string(), Some(Suggestion {
            text: "reddit.com/r/programming".to_string(),
            completion: "reddit.com/r/programming".to_string(),
            description: Some("Popular programming community".to_string()),
            score: 1.0,
        })),
        UIResponse::selection(
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
                SelectionItem { 
                    id: "askreddit".to_string(), 
                    title: "r/AskReddit".to_string(), 
                    description: Some("Ask and answer thought-provoking questions".to_string()),
                    completion: "reddit.com/r/AskReddit".to_string() 
                },
            ]
        )
    ])
}

fn ui_subreddit_view_guide(query: &str, ctx: &HashMap<String, String>) -> UIResponse {
    let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
    UIResponse::multiple(vec![
        UIResponse::suggestions(query.to_string(), Some(Suggestion {
            text: format!("reddit.com/r/{}/hot", subreddit),
            completion: format!("reddit.com/r/{}/hot", subreddit),
            description: Some("Import hot posts from this subreddit".to_string()),
            score: 1.0,
        })),
        UIResponse::guide(
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
    ])
}

fn ui_import_thread_view(query: &str, ctx: &HashMap<String, String>) -> UIResponse {
    let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
    UIResponse::guide(
        query.to_string(),
        format!("Import Comments from r/{}", subreddit),
        "Choose how to import comments for sorting.".to_string(),
        vec![
            GuideOption {
                key: "paste".to_string(),
                label: "Paste Thread URL".to_string(),
                description: "Import a specific Reddit thread by pasting its URL.".to_string(),
                completion: format!("reddit.com/r/{}/comments/", subreddit),
            },
            GuideOption {
                key: "random".to_string(),
                label: "Random Hot Thread".to_string(),
                description: "Import comments from a random popular thread.".to_string(),
                completion: format!("reddit.com/r/{}/comments/{}", subreddit, generate_random_post_id()),
            },
        ]
    )
}

fn ui_specific_comment_thread(_query: &str, ctx: &HashMap<String, String>) -> UIResponse {
    let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
    let post_id = ctx.get("post_id").cloned().unwrap_or_default();
    
    UIResponse::not_yet_implemented(
        "Comment Thread Import".to_string(),
        format!("Import and sort comments from r/{} post {}", subreddit, post_id),
        Some("https://github.com/yourorg/sorter/issues/comment-import".to_string())
    )
}

fn ui_import_hot_posts(_query: &str, ctx: &HashMap<String, String>) -> UIResponse {
    let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
    UIResponse::not_yet_implemented(
        "Hot Posts Import".to_string(),
        format!("Import and sort hot posts from r/{}", subreddit),
        Some("https://github.com/yourorg/sorter/issues/hot-posts".to_string())
    )
}

fn ui_import_top_posts(_query: &str, ctx: &HashMap<String, String>) -> UIResponse {
    let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
    UIResponse::not_yet_implemented(
        "Top Posts Import".to_string(),
        format!("Import and sort top posts from r/{}", subreddit),
        Some("https://github.com/yourorg/sorter/issues/top-posts".to_string())
    )
}

fn ui_import_new_posts(_query: &str, ctx: &HashMap<String, String>) -> UIResponse {
    let subreddit = ctx.get("subreddit").cloned().unwrap_or_default();
    UIResponse::not_yet_implemented(
        "New Posts Import".to_string(),
        format!("Import and sort new posts from r/{}", subreddit),
        Some("https://github.com/yourorg/sorter/issues/new-posts".to_string())
    )
}

fn ui_user_selection(_query: &str, _ctx: &HashMap<String, String>) -> UIResponse {
    UIResponse::guide(
        _query.to_string(),
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
}

fn ui_user_profile_view(_query: &str, ctx: &HashMap<String, String>) -> UIResponse {
    let username = ctx.get("username").cloned().unwrap_or_default();
    UIResponse::not_yet_implemented(
        "User Profile Import".to_string(),
        format!("Import and sort content from u/{}", username),
        Some("https://github.com/yourorg/sorter/issues/user-profiles".to_string())
    )
}

// --- Suggestion Handler Implementations ---

fn suggest_root_children(query: &str, partial: &str, _node: &UINode, _context: &HashMap<String, String>) -> UIResponse {
    // Since we can't easily access node children in the handler anymore,
    // we'll hardcode the known children for now
    let children = vec!["r", "u"];
    
    let suggestion = children.iter()
        .find(|&&k| k.starts_with(partial))
        .map(|k| Suggestion {
            text: format!("reddit.com/{}/", k),
            completion: format!("reddit.com/{}/", k),
            description: Some(match *k {
                "r" => "Browse subreddits".to_string(),
                "u" => "Browse user profiles".to_string(),
                _ => format!("Go to /{}/", k),
            }),
            score: 1.0,
        });
    UIResponse::suggestions(query.to_string(), suggestion)
}

fn suggest_subreddit_children(query: &str, partial: &str, _node: &UINode, context: &HashMap<String, String>) -> UIResponse {
    let subreddit = context.get("subreddit").cloned().unwrap_or_else(|| "programming".to_string());
    
    // Hardcode known children for now
    let children = vec!["comments", "hot", "top", "new"];
    
    let suggestion = children.iter()
        .find(|&&k| k.starts_with(partial))
        .map(|k| Suggestion {
            text: format!("reddit.com/r/{}/{}", subreddit, k),
            completion: format!("reddit.com/r/{}/{}", subreddit, k),
            description: Some(match *k {
                "comments" => "Browse and sort comments".to_string(),
                "hot" => "Import hot posts".to_string(),
                "top" => "Import top posts".to_string(),
                "new" => "Import new posts".to_string(),
                _ => format!("Go to {}", k),
            }),
            score: 1.0,
        });
    UIResponse::suggestions(query.to_string(), suggestion)
}

fn suggest_subreddit_from_api(query: &str, partial: &str, _node: &UINode, _context: &HashMap<String, String>) -> UIResponse {
    let popular_subreddits = vec![
        ("programming", "Computer programming discussions"),
        ("rust", "The Rust programming language"),
        ("webdev", "Web development community"),
        ("python", "The Python programming language"),
        ("javascript", "JavaScript programming language"),
        ("askreddit", "Ask and answer thought-provoking questions"),
        ("technology", "Technology news and discussions"),
        ("science", "Science news and discussions"),
    ];

    let suggestion = popular_subreddits.iter()
        .find(|(name, _)| name.starts_with(partial))
        .map(|(name, desc)| Suggestion {
            text: format!("reddit.com/r/{}", name),
            completion: format!("reddit.com/r/{}", name),
            description: Some(desc.to_string()),
            score: 1.0,
        });

    UIResponse::suggestions(query.to_string(), suggestion)
}

fn suggest_post_id_from_api(query: &str, _partial: &str, _node: &UINode, context: &HashMap<String, String>) -> UIResponse {
    let subreddit = context.get("subreddit").cloned().unwrap_or_else(|| "programming".to_string());
    let random_id = generate_random_post_id();
    let suggestion = Some(Suggestion {
        text: format!("{}{}", query, random_id),
        completion: format!("{}{}", query, random_id),
        description: Some(format!("Random popular thread from r/{}", subreddit)),
        score: 1.0,
    });

    UIResponse::suggestions(query.to_string(), suggestion)
}

fn suggest_username_from_api(query: &str, partial: &str, _node: &UINode, _context: &HashMap<String, String>) -> UIResponse {
    let popular_users = vec![
        ("spez", "Reddit CEO"),
        ("AutoModerator", "Reddit's automated moderator"),
        ("poem_for_your_sprog", "Famous Reddit poet"),
    ];

    let suggestion = popular_users.iter()
        .find(|(name, _)| name.starts_with(partial))
        .map(|(name, desc)| Suggestion {
            text: format!("reddit.com/u/{}", name),
            completion: format!("reddit.com/u/{}", name),
            description: Some(desc.to_string()),
            score: 1.0,
        });

    UIResponse::suggestions(query.to_string(), suggestion)
}

// --- Public API ---

/// Create a new UI Graph instance for parsing Reddit URLs with aliases
pub fn create_reddit_graph() -> UITrie {
    build_ui_graph()
}

/// Parse a query string and return a UI response
pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    let trie = build_ui_graph();
    trie.parse(query)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aliases_work() {
        let trie = build_ui_graph();
        
        // All these should lead to the same reddit root node
        let queries = vec![
            "reddit.com/",
            "r/",            // Short alias
        ];
        
        for query in queries {
            match trie.parse(query) {
                UIResponse::Multiple(responses) => {
                    // Should contain both suggestions and guide
                    let has_guide = responses.responses.iter().any(|r| matches!(r, UIResponse::Guide(_)));
                    assert!(has_guide, "Query '{}' should show reddit root guide", query);
                    
                    // Check that guide has both 'r' and 'u' options
                    if let Some(UIResponse::Guide(guide_data)) = responses.responses.iter()
                        .find(|r| matches!(r, UIResponse::Guide(_))) {
                        assert_eq!(guide_data.title, "Welcome to Sorter for Reddit");
                        let has_r = guide_data.options.iter().any(|opt| opt.key == "r");
                        let has_u = guide_data.options.iter().any(|opt| opt.key == "u");
                        assert!(has_r && has_u, "Should have both r and u options for '{}'", query);
                    }
                }
                _ => panic!("Expected Multiple responses for '{}'", query),
            }
        }
    }
    
    #[test]
    fn test_alias_traversal() {
        let trie = build_ui_graph();
        
        // Test that we can traverse deeper from aliases
        let queries = vec![
            ("r/r/", "reddit.com/r/"),
            ("reddit.com/r/", "reddit.com/r/"),
        ];
        
        for (input, _expected) in queries {
            match trie.parse(input) {
                UIResponse::Multiple(responses) => {
                    let has_selection = responses.responses.iter()
                        .any(|r| matches!(r, UIResponse::Selection(_)));
                    assert!(has_selection, "Query '{}' should show subreddit selection", input);
                }
                _ => panic!("Expected Multiple responses for '{}'", input),
            }
        }
        
        // Test even deeper traversal
        let deep_queries = vec![
            "r/r/programming/",
            "reddit.com/r/webdev/",
        ];
        
        for query in deep_queries {
            match trie.parse(query) {
                UIResponse::Multiple(_) => {}, // Expected
                _ => panic!("Expected Multiple responses for '{}'", query),
            }
        }
    }
    
    #[test]
    fn test_prefix_to_alias() {
        let trie = build_ui_graph();
        
        // "r" prefix should suggest "reddit.com/"
        match trie.parse("r") {
            UIResponse::Suggestions(data) => {
                assert_eq!(data.suggestion.as_ref().unwrap().completion, "reddit.com/");
            }
            _ => panic!("Expected Suggestions for 'r'"),
        }
        
        // But "r/" should go directly to reddit root
        match trie.parse("r/") {
            UIResponse::Multiple(responses) => {
                let has_guide = responses.responses.iter()
                    .any(|r| matches!(r, UIResponse::Guide(_)));
                assert!(has_guide, "Should show reddit root guide for 'r/'");
            }
            _ => panic!("Expected Multiple for 'r/'"),
        }
    }
}
