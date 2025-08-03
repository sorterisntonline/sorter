use std::collections::HashMap;
use crate::ui::types::{UIResponse, Suggestion, GuideOption, SelectionItem};

// --- Data Structures ---

/// A handler for when a path is fully matched. Generates the main UI.
/// - `query`: The full, original query string from the user.
/// - `context`: Captured path variables (e.g., {"subreddit": "rust"}).
type ExactMatchHandler = fn(query: &str, context: &HashMap<String, String>) -> UIResponse;

/// A handler for when a user's input is a partial match for one of this node's children.
/// - `query`: The full, original query string.
/// - `partial_segment`: The part of the segment the user has typed (e.g., "progra").
/// - `parent_node`: The node on which the partial match is occurring.
/// - `context`: Captured path variables (e.g., {"subreddit": "rust"}).
type PartialMatchHandler = fn(query: &str, partial_segment: &str, parent_node: &UINode, context: &HashMap<String, String>) -> UIResponse;

#[derive(Default)]
pub struct NodeHandlers {
    pub on_exact_match: Option<ExactMatchHandler>,
    pub on_partial_match: Option<PartialMatchHandler>,
}

/// A node in our UI Trie. Represents a segment of a URL.
pub struct UINode {
    /// Literal children, e.g., "r", "comments", "hot".
    pub children: HashMap<String, UINode>,
    /// A special child for a single variable segment, e.g., "<subreddit>".
    /// (String = variable name, Box<UINode> = the child node).
    pub variable_child: Option<(String, Box<UINode>)>,
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

/// The root of our UI parsing system.
pub struct UITrie {
    platforms: HashMap<String, UINode>,
}

// --- Trie Traversal Logic ---

impl UITrie {
    /// The main entry point for parsing a user's query.
    pub fn parse(&self, query: &str) -> UIResponse {
        let normalized = normalize_input(query);

        // Handle empty or root-level prefixes (e.g., "r", "re", "redd")
        if !normalized.contains('/') {
            if let Some(suggestion) = suggest_platform(&normalized) {
                return UIResponse::suggestions(query.to_string(), Some(suggestion));
            }
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
        self.traverse(root_node, &segments, &mut context, query)
    }

    /// Recursively traverses the Trie based on URL segments.
    fn traverse<'a>(
        &self,
        node: &'a UINode,
        segments: &[&'a str],
        context: &mut HashMap<String, String>,
        query: &str
    ) -> UIResponse {
        // Base case: We have consumed all segments.
        if segments.is_empty() {
            return node.handlers.on_exact_match
                .map(|f| f(query, context))
                .unwrap_or_else(|| UIResponse::error("InvalidPath".into(), "This path is incomplete.".into()));
        }

        let current_segment = segments[0];
        let remaining_segments = &segments[1..];

        // --- Try to match the current segment ---

        // 1. Try to match a literal child (e.g., "r", "comments").
        if let Some(child_node) = node.children.get(current_segment) {
            return self.traverse(child_node, remaining_segments, context, query);
        }

        // 2. Try to match a variable child (e.g., "<subreddit>").
        if let Some((var_name, child_node)) = &node.variable_child {
            // Validate the variable if needed
            if is_valid_segment(var_name, current_segment) {
                context.insert(var_name.clone(), current_segment.to_string());
                return self.traverse(child_node.as_ref(), remaining_segments, context, query);
            }
        }

        // --- No full match found, handle as a partial match or error ---

        // If this is the last segment, it's a partial match.
        if remaining_segments.is_empty() {
            return node.handlers.on_partial_match
                .map(|f| f(query, current_segment, node, context))
                .unwrap_or_else(|| UIResponse::error("InvalidPath".into(), format!("'{}' is not a valid path.", query)));
        }
        
        // If it's not the last segment and no match was found, the path is invalid.
        UIResponse::error("InvalidPath".into(), format!("'{}' contains an invalid segment.", query))
    }
}

// --- Declarative Trie Definition ---

pub fn build_ui_trie() -> UITrie {
    let reddit_trie = UINode {
        handlers: NodeHandlers {
            on_exact_match: Some(ui_reddit_root_guide),
            on_partial_match: Some(suggest_root_children),
        },
        children: HashMap::from([(
            "r".to_string(), // Node for "reddit.com/r/"
            UINode {
                handlers: NodeHandlers {
                    on_exact_match: Some(ui_subreddit_selection),
                    on_partial_match: Some(suggest_subreddit_from_api),
                },
                variable_child: Some((
                    "subreddit".to_string(),
                    Box::new(UINode { // Node for "reddit.com/r/<subreddit>"
                        handlers: NodeHandlers {
                            on_exact_match: Some(ui_subreddit_view_guide),
                            on_partial_match: Some(suggest_subreddit_children),
                        },
                        children: HashMap::from([
                            // Node for "reddit.com/r/<subreddit>/comments/"
                            ("comments".to_string(), UINode {
                                handlers: NodeHandlers {
                                    on_exact_match: Some(ui_import_thread_view),
                                    on_partial_match: Some(suggest_post_id_from_api),
                                },
                                variable_child: Some((
                                    "post_id".to_string(),
                                    Box::new(UINode {
                                        handlers: NodeHandlers {
                                            on_exact_match: Some(ui_specific_comment_thread),
                                            ..Default::default()
                                        },
                                        ..UINode::default()
                                    })
                                )),
                                ..UINode::default()
                            }),
                            ("hot".to_string(), UINode {
                                handlers: NodeHandlers { 
                                    on_exact_match: Some(ui_import_hot_posts), 
                                    ..Default::default() 
                                },
                                ..UINode::default()
                            }),
                            ("top".to_string(), UINode {
                                handlers: NodeHandlers { 
                                    on_exact_match: Some(ui_import_top_posts), 
                                    ..Default::default() 
                                },
                                ..UINode::default()
                            }),
                            ("new".to_string(), UINode {
                                handlers: NodeHandlers { 
                                    on_exact_match: Some(ui_import_new_posts), 
                                    ..Default::default() 
                                },
                                ..UINode::default()
                            }),
                        ]),
                        ..UINode::default()
                    }),
                )),
                ..UINode::default()
            },
        ), (
            "u".to_string(), // Node for "reddit.com/u/"
            UINode {
                handlers: NodeHandlers {
                    on_exact_match: Some(ui_user_selection),
                    on_partial_match: Some(suggest_username_from_api),
                },
                variable_child: Some((
                    "username".to_string(),
                    Box::new(UINode {
                        handlers: NodeHandlers {
                            on_exact_match: Some(ui_user_profile_view),
                            ..Default::default()
                        },
                        ..UINode::default()
                    })
                )),
                ..UINode::default()
            },
        )]),
        ..UINode::default()
    };

    UITrie {
        platforms: HashMap::from([("reddit.com".to_string(), reddit_trie)]),
    }
}

// --- UI Handler Implementations (Pluggable Logic) ---

// UI for: "reddit.com/"
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

// UI for: "reddit.com/r/"
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

// UI for "reddit.com/r/<subreddit>/"
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

fn suggest_root_children(query: &str, partial: &str, node: &UINode, _context: &HashMap<String, String>) -> UIResponse {
    let suggestion = node.children.keys()
        .find(|k| k.starts_with(partial))
        .map(|k| Suggestion {
            text: format!("reddit.com/{}/", k),
            completion: format!("reddit.com/{}/", k),
            description: Some(match k.as_str() {
                "r" => "Browse subreddits".to_string(),
                "u" => "Browse user profiles".to_string(),
                _ => format!("Go to /{}/", k),
            }),
            score: 1.0,
        });
    UIResponse::suggestions(query.to_string(), suggestion)
}

fn suggest_subreddit_children(query: &str, partial: &str, node: &UINode, context: &HashMap<String, String>) -> UIResponse {
    // Use the captured subreddit from context - much cleaner than parsing the query!
    let subreddit = context.get("subreddit").cloned().unwrap_or_else(|| "programming".to_string());
    
    let suggestion = node.children.keys()
        .find(|k| k.starts_with(partial))
        .map(|k| Suggestion {
            text: format!("reddit.com/r/{}/{}", subreddit, k),
            completion: format!("reddit.com/r/{}/{}", subreddit, k),
            description: Some(match k.as_str() {
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
    // In a real implementation, this would call an API to get subreddit suggestions
    // For now, provide static popular subreddits that match the partial
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
    // In a real implementation, this would suggest actual post IDs from the subreddit
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
    // In a real implementation, this would suggest actual usernames
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

// --- Helper Functions ---

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

fn suggest_platform(prefix: &str) -> Option<Suggestion> {
    let reddit_prefixes = ["r", "re", "red", "redd", "reddi", "reddit", "reddit.", "reddit.c", "reddit.co"];
    
    if reddit_prefixes.iter().any(|&p| p == prefix || "reddit.com".starts_with(prefix)) {
        return Some(Suggestion {
            text: "reddit.com/".to_string(),
            completion: "reddit.com/".to_string(),
            description: Some("Go to Reddit homepage".to_string()),
            score: 1.0,
        });
    }
    
    None
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

// --- Public API ---

/// Create a new UI Trie instance for parsing Reddit URLs
pub fn create_reddit_trie() -> UITrie {
    build_ui_trie()
}

/// Parse a query string and return a UI response
pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    let trie = build_ui_trie();
    trie.parse(query)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trie_basic_parsing() {
        let trie = build_ui_trie();
        
        // Test platform suggestions
        match trie.parse("r") {
            UIResponse::Suggestions(data) => {
                assert_eq!(data.suggestion.as_ref().unwrap().completion, "reddit.com/");
            }
            _ => panic!("Expected Suggestions for 'r'"),
        }

        // Test reddit root
        match trie.parse("reddit.com/") {
            UIResponse::Multiple(_) => {} // Expected
            _ => panic!("Expected Multiple for reddit.com/"),
        }
    }

    #[test]
    fn test_subreddit_navigation() {
        let trie = build_ui_trie();
        
        // Test subreddit selection
        match trie.parse("reddit.com/r/") {
            UIResponse::Multiple(_) => {} // Expected
            _ => panic!("Expected Multiple for reddit.com/r/"),
        }

        // Test specific subreddit
        match trie.parse("reddit.com/r/programming/") {
            UIResponse::Multiple(_) => {} // Expected
            _ => panic!("Expected Multiple for reddit.com/r/programming/"),
        }
    }

    #[test]
    fn test_partial_matching() {
        let trie = build_ui_trie();
        
        // Test partial command matching
        match trie.parse("reddit.com/r/programming/h") {
            UIResponse::Suggestions(data) => {
                let suggestion = data.suggestion.as_ref().unwrap();
                assert!(suggestion.completion.contains("hot"));
            }
            _ => panic!("Expected Suggestions for partial match"),
        }
    }

    #[test]
    fn test_error_handling() {
        let trie = build_ui_trie();
        
        // Test unsupported platform
        match trie.parse("youtube.com/watch") {
            UIResponse::ErrorPage(data) => {
                assert_eq!(data.error_type, "UnsupportedPlatform");
            }
            _ => panic!("Expected ErrorPage for YouTube"),
        }
    }

    // Test the specific flow described in parser.tdsl
    #[test]
    fn test_parser_tdsl_flow() {
        let trie = build_ui_trie();
        
        // Step 1: "r" -> suggests "reddit.com/"
        match trie.parse("r") {
            UIResponse::Suggestions(data) => {
                let suggestion = data.suggestion.as_ref().unwrap();
                assert_eq!(suggestion.completion, "reddit.com/");
                assert_eq!(suggestion.text, "reddit.com/");
            }
            _ => panic!("Expected Suggestions for 'r'"),
        }

        // Step 2: "re" -> suggests "reddit.com/"
        match trie.parse("re") {
            UIResponse::Suggestions(data) => {
                let suggestion = data.suggestion.as_ref().unwrap();
                assert_eq!(suggestion.completion, "reddit.com/");
                assert_eq!(suggestion.text, "reddit.com/");
            }
            _ => panic!("Expected Suggestions for 're'"),
        }

        // Step 3: "reddit.com/" -> shows infographic with 'r' (subreddit) and 'u' (user) options
        match trie.parse("reddit.com/") {
            UIResponse::Multiple(responses) => {
                // Should contain both suggestions and guide
                let has_guide = responses.responses.iter().any(|r| matches!(r, UIResponse::Guide(_)));
                let has_suggestions = responses.responses.iter().any(|r| matches!(r, UIResponse::Suggestions(_)));
                assert!(has_guide, "Should contain a guide response");
                assert!(has_suggestions, "Should contain suggestions");
                
                // Check that guide has both 'r' and 'u' options
                if let Some(UIResponse::Guide(guide_data)) = responses.responses.iter().find(|r| matches!(r, UIResponse::Guide(_))) {
                    let has_r_option = guide_data.options.iter().any(|opt| opt.key == "r");
                    let has_u_option = guide_data.options.iter().any(|opt| opt.key == "u");
                    assert!(has_r_option, "Should have 'r' option for subreddits");
                    assert!(has_u_option, "Should have 'u' option for users");
                }
            }
            _ => panic!("Expected Multiple responses for 'reddit.com/'"),
        }

        // Step 4: "reddit.com/r/" -> shows subreddit selection (randomly chose sub from list)
        match trie.parse("reddit.com/r/") {
            UIResponse::Multiple(responses) => {
                // Should contain selection with popular subreddits
                let has_selection = responses.responses.iter().any(|r| matches!(r, UIResponse::Selection(_)));
                assert!(has_selection, "Should contain a selection response with subreddit options");
                
                // Check that selection has subreddit options
                if let Some(UIResponse::Selection(selection_data)) = responses.responses.iter().find(|r| matches!(r, UIResponse::Selection(_))) {
                    assert!(!selection_data.items.is_empty(), "Should have subreddit options");
                    // Verify some popular subreddits are present
                    let has_programming = selection_data.items.iter().any(|item| item.id == "programming");
                    let has_rust = selection_data.items.iter().any(|item| item.id == "rust");
                    assert!(has_programming, "Should include programming subreddit");
                    assert!(has_rust, "Should include rust subreddit");
                }
            }
            _ => panic!("Expected Multiple responses for 'reddit.com/r/'"),
        }

        // Step 5: "reddit.com/r/{sub}" -> shows subreddit view
        match trie.parse("reddit.com/r/programming") {
            UIResponse::Multiple(responses) => {
                let has_guide = responses.responses.iter().any(|r| matches!(r, UIResponse::Guide(_)));
                assert!(has_guide, "Should show subreddit view guide");
                
                // Check that guide has options for hot, top, new, comments
                if let Some(UIResponse::Guide(guide_data)) = responses.responses.iter().find(|r| matches!(r, UIResponse::Guide(_))) {
                    let has_hot = guide_data.options.iter().any(|opt| opt.key == "hot");
                    let has_top = guide_data.options.iter().any(|opt| opt.key == "top");
                    let has_new = guide_data.options.iter().any(|opt| opt.key == "new");
                    let has_comments = guide_data.options.iter().any(|opt| opt.key == "comments");
                    
                    assert!(has_hot, "Should have 'hot' option");
                    assert!(has_top, "Should have 'top' option");
                    assert!(has_new, "Should have 'new' option");
                    assert!(has_comments, "Should have 'comments' option");
                }
            }
            _ => panic!("Expected Multiple responses for 'reddit.com/r/programming'"),
        }

        // Step 6: "reddit.com/r/{sub}/" -> shows infographic with comments option
        match trie.parse("reddit.com/r/programming/") {
            UIResponse::Multiple(responses) => {
                let has_guide = responses.responses.iter().any(|r| matches!(r, UIResponse::Guide(_)));
                assert!(has_guide, "Should show subreddit view guide");
                
                // Verify the comments option leads to the comments path
                if let Some(UIResponse::Guide(guide_data)) = responses.responses.iter().find(|r| matches!(r, UIResponse::Guide(_))) {
                    let comments_option = guide_data.options.iter().find(|opt| opt.key == "comments");
                    assert!(comments_option.is_some(), "Should have comments option");
                    if let Some(opt) = comments_option {
                        assert_eq!(opt.completion, "reddit.com/r/programming/comments/");
                    }
                }
            }
            _ => panic!("Expected Multiple responses for 'reddit.com/r/programming/'"),
        }

        // Step 7: "reddit.com/r/{sub}/comments/" -> shows thread import options
        match trie.parse("reddit.com/r/programming/comments/") {
            UIResponse::Guide(guide_data) => {
                assert_eq!(guide_data.title, "Import Comments from r/programming");
                assert!(!guide_data.options.is_empty(), "Should have thread import options");
                
                // Should have options for pasting URL or random thread
                let has_paste_option = guide_data.options.iter().any(|opt| opt.key == "paste");
                let has_random_option = guide_data.options.iter().any(|opt| opt.key == "random");
                assert!(has_paste_option, "Should have paste URL option");
                assert!(has_random_option, "Should have random thread option");
            }
            _ => panic!("Expected Guide for 'reddit.com/r/programming/comments/'"),
        }
    }

    #[test]
    fn test_parser_tdsl_flow_variations() {
        let trie = build_ui_trie();
        
        // Test with different subreddit names
        for subreddit in &["rust", "webdev", "askreddit"] {
            let query = format!("reddit.com/r/{}", subreddit);
            match trie.parse(&query) {
                UIResponse::Multiple(_) => {}, // Expected
                _ => panic!("Expected Multiple for {}", query),
            }
            
            let query_with_slash = format!("reddit.com/r/{}/", subreddit);
            match trie.parse(&query_with_slash) {
                UIResponse::Multiple(_) => {}, // Expected
                _ => panic!("Expected Multiple for {}", query_with_slash),
            }
            
            let comments_query = format!("reddit.com/r/{}/comments/", subreddit);
            match trie.parse(&comments_query) {
                UIResponse::Guide(_) => {}, // Expected
                _ => panic!("Expected Guide for {}", comments_query),
            }
        }
    }

    #[test]
    fn test_parser_tdsl_flow_edge_cases() {
        let trie = build_ui_trie();
        
        // Test case variations
        match trie.parse("R") {
            UIResponse::Suggestions(data) => {
                assert_eq!(data.suggestion.as_ref().unwrap().completion, "reddit.com/");
            }
            _ => panic!("Expected Suggestions for uppercase 'R'"),
        }
        
        match trie.parse("RE") {
            UIResponse::Suggestions(data) => {
                assert_eq!(data.suggestion.as_ref().unwrap().completion, "reddit.com/");
            }
            _ => panic!("Expected Suggestions for uppercase 'RE'"),
        }
        
        // Test with protocols
        match trie.parse("https://reddit.com/") {
            UIResponse::Multiple(_) => {}, // Expected
            _ => panic!("Expected Multiple for https://reddit.com/"),
        }
        
        match trie.parse("http://www.reddit.com/r/") {
            UIResponse::Multiple(_) => {}, // Expected
            _ => panic!("Expected Multiple for http://www.reddit.com/r/"),
        }
    }

    #[test]
    fn test_context_aware_partial_matching() {
        let trie = build_ui_trie();
        
        // Test that partial matching now correctly uses context to build completions
        // This tests the improvement where we use captured variables instead of parsing the query
        
        // Test partial matching in rust subreddit - context should contain subreddit name
        match trie.parse("reddit.com/r/rust/h") {
            UIResponse::Suggestions(data) => {
                let suggestion = data.suggestion.as_ref().unwrap();
                assert_eq!(suggestion.completion, "reddit.com/r/rust/hot");
                assert!(suggestion.text.contains("rust"));
                assert!(suggestion.description.as_ref().unwrap().contains("hot"));
            }
            _ => panic!("Expected Suggestions for partial match in rust subreddit"),
        }
        
        // Test partial matching in different subreddit - should use different context
        match trie.parse("reddit.com/r/webdev/h") {
            UIResponse::Suggestions(data) => {
                let suggestion = data.suggestion.as_ref().unwrap();
                assert_eq!(suggestion.completion, "reddit.com/r/webdev/hot");
                assert!(suggestion.text.contains("webdev"));
                assert!(suggestion.description.as_ref().unwrap().contains("hot"));
            }
            _ => panic!("Expected Suggestions for partial match in webdev subreddit"),
        }
        
        // Test another type of partial matching: partial commands
        match trie.parse("reddit.com/r/programming/co") {
            UIResponse::Suggestions(data) => {
                let suggestion = data.suggestion.as_ref().unwrap();
                assert_eq!(suggestion.completion, "reddit.com/r/programming/comments");
                assert!(suggestion.text.contains("programming")); // Context-aware!
                assert!(suggestion.description.as_ref().unwrap().contains("comments"));
            }
            _ => panic!("Expected Suggestions for partial command match"),
        }
        
        // Test that the comments path uses context correctly
        match trie.parse("reddit.com/r/programming/comments/") {
            UIResponse::Guide(data) => {
                // This demonstrates that context is properly passed through exact matches
                assert_eq!(data.title, "Import Comments from r/programming");
                assert!(data.title.contains("programming")); // Context-aware title!
            }
            _ => panic!("Expected Guide for comments path"),
        }
    }
}