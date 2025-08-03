use std::collections::HashMap;
use std::sync::OnceLock;
use crate::ui::types::{UIResponse, Suggestion, GuideOption, SelectionItem, SuggestionsData, GuideData, SelectionData, MultipleResponseData, ErrorPageData};

// --- Data Structures ---

#[derive(Debug, PartialEq, Clone)]
pub enum ParseResult {
    Partial(PartialParse),
    Complete(ParsedUrl),
    Error(ParseError),
}

#[derive(Debug, PartialEq, Clone)]
pub enum PartialParse {
    Prefix(String),           // "r", "re", "red", etc.
    Domain(String),           // "reddit.c", "reddit.co", etc.
    Path(ParsedUrl, String),  // Complete parse + remaining incomplete part
}

#[derive(Debug, PartialEq, Clone)]
pub enum ParseError {
    InvalidFormat(String),      // Input doesn't match any expected pattern
    UnsupportedPlatform(String), // Platform not yet supported (e.g., "youtube.com")
    MalformedUrl(String),       // URL structure is invalid
}

#[derive(Debug, PartialEq, Clone)]
pub enum ParsedUrl {
    Reddit(RedditPath),
    // In the future: YouTube, GitHub, etc.
}

#[derive(Debug, PartialEq, Clone)]
pub enum RedditPath {
    Root,
    SubredditRoot,
    Subreddit(String),
    SubredditWithSlash(String),
    Comments(String, Option<String>), // subreddit, optional post_id
}

// --- Route Tree Abstraction ---

#[derive(Clone)]
struct RouteNode {
    segment_type: SegmentType,
    children: Vec<RouteNode>,
    suggestion_fn: Option<fn(&HashMap<String, String>) -> Suggestion>,
    ui_fn: Option<fn(&str, &HashMap<String, String>) -> UIResponse>,
}

#[derive(Clone)]
enum SegmentType {
    Literal(String),
    Variable { name: String, validator: fn(&str) -> bool },
    Choice(Vec<String>),
    Optional(Box<SegmentType>),
}

struct RouteTree {
    platforms: HashMap<String, RouteNode>,
}

impl RouteNode {
    fn matches_segment(&self, segment: &str, context: &mut HashMap<String, String>) -> MatchResult {
        match &self.segment_type {
            SegmentType::Literal(value) => {
                if segment == value {
                    MatchResult::Complete
                } else if value.starts_with(segment) {
                    MatchResult::Partial
                } else {
                    MatchResult::None
                }
            }
            SegmentType::Variable { name, validator } => {
                if validator(segment) {
                    context.insert(name.clone(), segment.to_string());
                    MatchResult::Complete
                } else if segment.is_empty() {
                    MatchResult::Partial
                } else {
                    MatchResult::None
                }
            }
            SegmentType::Choice(options) => {
                if let Some(option) = options.iter().find(|&opt| opt == segment) {
                    context.insert("choice".to_string(), option.clone());
                    MatchResult::Complete
                } else if let Some(option) = options.iter().find(|&opt| opt.starts_with(segment)) {
                    context.insert("choice".to_string(), option.clone());
                    MatchResult::Partial
                } else {
                    MatchResult::None
                }
            }
            SegmentType::Optional(inner) => {
                match inner.as_ref() {
                    SegmentType::Literal(value) if value == segment => MatchResult::Complete,
                    _ if segment.is_empty() => MatchResult::Complete,
                    _ => MatchResult::None,
                }
            }
        }
    }

    fn find_best_child(&self, segment: &str) -> Option<&RouteNode> {
        self.children.iter().find(|child| {
            let mut temp_context = HashMap::new();
            !matches!(child.matches_segment(segment, &mut temp_context), MatchResult::None)
        })
    }

    fn get_suggestion(&self, context: &HashMap<String, String>) -> Option<Suggestion> {
        self.suggestion_fn.map(|f| f(context))
    }

    fn get_ui(&self, query: &str, context: &HashMap<String, String>) -> Option<UIResponse> {
        self.ui_fn.map(|f| f(query, context))
    }
}

#[derive(Debug, PartialEq)]
enum MatchResult {
    Complete,
    Partial,
    None,
}

impl RouteTree {
    fn parse(&self, input: &str) -> ParseResult {
        let normalized = normalize_input(input);
        let segments = tokenize(&normalized);

        if segments.is_empty() {
            return ParseResult::Partial(PartialParse::Prefix("".to_string()));
        }

        // Handle domain/prefix matching
        let domain_part = &segments[0];
        
        // Check for supported platforms
        if let Some(platform_node) = self.platforms.get("reddit.com") {
            if domain_part == "reddit.com" {
                return self.parse_path(platform_node, &segments[1..], domain_part);
            } else if "reddit.com".starts_with(domain_part) || is_reddit_prefix(domain_part) {
                return ParseResult::Partial(PartialParse::Prefix(domain_part.clone()));
            }
        }

        // Check for unsupported platforms
        if is_unsupported_platform(domain_part) {
            return ParseResult::Error(ParseError::UnsupportedPlatform(
                format!("Platform '{}' is not yet supported. Currently only Reddit URLs are supported.", domain_part)
            ));
        }

        ParseResult::Error(ParseError::InvalidFormat(
            format!("Unable to parse URL: '{}'", input)
        ))
    }

    fn parse_path(&self, root_node: &RouteNode, path_segments: &[String], domain: &str) -> ParseResult {
        let mut current_node = root_node;
        let mut context = HashMap::new();
        context.insert("domain".to_string(), domain.to_string());
        
        for (i, segment) in path_segments.iter().enumerate() {
            let mut temp_context = context.clone();
            match current_node.matches_segment(segment, &mut temp_context) {
                MatchResult::Complete => {
                    context = temp_context;
                    if let Some(child) = current_node.find_best_child(segment) {
                        current_node = child;
                    } else {
                        // No children, this is a terminal node
                        if i == path_segments.len() - 1 {
                            return ParseResult::Complete(self.context_to_parsed_url(&context));
                        } else {
                            return ParseResult::Error(ParseError::MalformedUrl(
                                format!("Invalid Reddit path: '{}'", path_segments[i+1..].join("/"))
                            ));
                        }
                    }
                }
                MatchResult::Partial => {
                    context = temp_context;
                    if i == path_segments.len() - 1 {
                        return ParseResult::Partial(PartialParse::Path(
                            self.context_to_parsed_url(&context),
                            segment.clone()
                        ));
                    } else {
                        return ParseResult::Error(ParseError::MalformedUrl(
                            format!("Invalid Reddit path: '{}'", path_segments[i..].join("/"))
                        ));
                    }
                }
                MatchResult::None => {
                    return ParseResult::Error(ParseError::MalformedUrl(
                        format!("Invalid Reddit path: '{}'", path_segments[i..].join("/"))
                    ));
                }
            }
        }

        // All segments consumed
        ParseResult::Complete(self.context_to_parsed_url(&context))
    }

    fn context_to_parsed_url(&self, context: &HashMap<String, String>) -> ParsedUrl {
        let path_type = context.get("path_type").map(|s| s.as_str()).unwrap_or("root");
        let subreddit = context.get("subreddit").cloned();
        let has_trailing_slash = context.get("trailing_slash").is_some();
        let _choice = context.get("choice").cloned();

        ParsedUrl::Reddit(match path_type {
            "subreddit_root" => RedditPath::SubredditRoot,
            "subreddit" => {
                let sub = subreddit.unwrap_or_default();
                if has_trailing_slash {
                    RedditPath::SubredditWithSlash(sub)
                } else {
                    RedditPath::Subreddit(sub)
                }
            }
            "comments" => RedditPath::Comments(
                subreddit.unwrap_or_default(),
                context.get("post_id").cloned()
            ),
            _ => RedditPath::Root,
        })
    }
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

fn tokenize(input: &str) -> Vec<String> {
    if input.is_empty() {
        return vec![];
    }
    
    input.split('/')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn is_reddit_prefix(input: &str) -> bool {
    let prefixes = ["r", "re", "red", "redd", "reddi", "reddit", "reddit.", "reddit.c", "reddit.co"];
    prefixes.contains(&input)
}

fn is_unsupported_platform(domain: &str) -> bool {
    let unsupported = [
        "youtube.com", "youtu.be", "github.com", "twitter.com", 
        "x.com", "facebook.com", "www.youtube.com"
    ];
    unsupported.iter().any(|&platform| domain.contains(platform))
}

fn is_valid_subreddit_name(name: &str) -> bool {
    !name.is_empty() && 
    name.len() <= 21 && 
    name.chars().all(|c| c.is_alphanumeric() || c == '_')
}

fn is_valid_post_id(id: &str) -> bool {
    !id.is_empty() && 
    id.len() <= 10 && 
    id.chars().all(|c| c.is_alphanumeric())
}

// --- Suggestion Functions ---

fn suggest_reddit_root(_context: &HashMap<String, String>) -> Suggestion {
    Suggestion {
        text: "reddit.com/".to_string(),
        completion: "reddit.com/".to_string(),
        description: Some("Go to Reddit homepage".to_string()),
        score: 1.0,
    }
}

fn suggest_subreddit_root(_context: &HashMap<String, String>) -> Suggestion {
    Suggestion {
        text: "reddit.com/r/".to_string(),
        completion: "reddit.com/r/".to_string(),
        description: Some("Browse subreddits".to_string()),
        score: 1.0,
    }
}

fn suggest_popular_subreddit(_context: &HashMap<String, String>) -> Suggestion {
    Suggestion {
        text: "reddit.com/r/programming".to_string(),
        completion: "reddit.com/r/programming".to_string(),
        description: Some("Popular subreddit".to_string()),
        score: 1.0,
    }
}

fn suggest_subreddit_slash(context: &HashMap<String, String>) -> Suggestion {
    let subreddit = context.get("subreddit").map(|s| s.as_str()).unwrap_or("programming");
    Suggestion {
        text: format!("reddit.com/r/{}/", subreddit),
        completion: format!("reddit.com/r/{}/", subreddit),
        description: Some("View subreddit".to_string()),
        score: 1.0,
    }
}

fn suggest_random_comment(context: &HashMap<String, String>) -> Suggestion {
    let subreddit = context.get("subreddit").map(|s| s.as_str()).unwrap_or("programming");
    let choice = context.get("choice").map(|s| s.as_str()).unwrap_or("comments");
    
    if choice == "comments" {
        let random_id = generate_random_post_id();
        Suggestion {
            text: format!("reddit.com/r/{}/comments/{}", subreddit, random_id),
            completion: format!("reddit.com/r/{}/comments/{}", subreddit, random_id),
            description: Some("Random comment!".to_string()),
            score: 1.0,
        }
    } else {
        Suggestion {
            text: format!("reddit.com/r/{}/{}", subreddit, choice),
            completion: format!("reddit.com/r/{}/{}", subreddit, choice),
            description: Some(format!("View {} posts", choice)),
            score: 1.0,
        }
    }
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

// --- UI Functions ---

fn create_reddit_root_guide(query: &str, _context: &HashMap<String, String>) -> UIResponse {
    UIResponse::Guide(GuideData {
        query: query.to_string(),
        title: "Choose Reddit Content Type".to_string(),
        description: "What type of Reddit content would you like to explore?".to_string(),
        options: vec![
            GuideOption {
                key: "r".to_string(),
                label: "Subreddits".to_string(),
                description: "Browse communities and their posts".to_string(),
                completion: "reddit.com/r/".to_string(),
            },
            GuideOption {
                key: "u".to_string(),
                label: "Users".to_string(),
                description: "View user profiles and their posts".to_string(),
                completion: "reddit.com/u/".to_string(),
            },
        ],
    })
}

fn create_subreddit_selection(query: &str, _context: &HashMap<String, String>) -> UIResponse {
    UIResponse::Selection(SelectionData {
        query: query.to_string(),
        title: "Choose a Subreddit".to_string(),
        description: "Select from popular subreddits".to_string(),
        items: get_popular_subreddits(),
    })
}

fn create_subreddit_guide(query: &str, context: &HashMap<String, String>) -> UIResponse {
    let subreddit = context.get("subreddit").map(|s| s.as_str()).unwrap_or("programming");
    UIResponse::Guide(GuideData {
        query: query.to_string(),
        title: format!("Browse r/{}", subreddit),
        description: format!("What would you like to see in r/{}?", subreddit),
        options: vec![
            GuideOption {
                key: "comments".to_string(),
                label: "Comments".to_string(),
                description: "View random comments".to_string(),
                completion: format!("reddit.com/r/{}/comments/", subreddit),
            },
            GuideOption {
                key: "hot".to_string(),
                label: "Hot Posts".to_string(),
                description: "Currently trending posts".to_string(),
                completion: format!("reddit.com/r/{}/hot", subreddit),
            },
            GuideOption {
                key: "top".to_string(),
                label: "Top Posts".to_string(),
                description: "Highest rated posts".to_string(),
                completion: format!("reddit.com/r/{}/top", subreddit),
            },
        ],
    })
}

fn get_popular_subreddits() -> Vec<SelectionItem> {
    vec![
        SelectionItem {
            id: "programming".to_string(),
            title: "r/programming".to_string(),
            description: Some("Computer programming discussions".to_string()),
            completion: "reddit.com/r/programming".to_string(),
        },
        SelectionItem {
            id: "rust".to_string(),
            title: "r/rust".to_string(),
            description: Some("The Rust programming language".to_string()),
            completion: "reddit.com/r/rust".to_string(),
        },
        SelectionItem {
            id: "webdev".to_string(),
            title: "r/webdev".to_string(),
            description: Some("Web development community".to_string()),
            completion: "reddit.com/r/webdev".to_string(),
        },
    ]
}

// --- Route Tree Construction ---

fn build_route_tree() -> RouteTree {
    let root_node = RouteNode {
        segment_type: SegmentType::Literal("".to_string()), // Root catches empty path
        children: vec![
            // /r branch
            RouteNode {
                segment_type: SegmentType::Literal("r".to_string()),
                children: vec![
                    // /r/ - empty segment for trailing slash
                    RouteNode {
                        segment_type: SegmentType::Literal("".to_string()),
                        children: vec![
                            // /r/{subreddit}
                            RouteNode {
                                segment_type: SegmentType::Variable { 
                                    name: "subreddit".to_string(), 
                                    validator: is_valid_subreddit_name 
                                },
                                children: vec![
                                    // /r/{subreddit}/ - empty for trailing slash
                                    RouteNode {
                                        segment_type: SegmentType::Literal("".to_string()),
                                        children: vec![
                                            // /r/{subreddit}/comments or /r/{subreddit}/hot etc
                                            RouteNode {
                                                segment_type: SegmentType::Choice(vec![
                                                    "comments".to_string(),
                                                    "hot".to_string(),
                                                    "top".to_string(),
                                                    "new".to_string()
                                                ]),
                                                children: vec![
                                                    // /r/{subreddit}/comments/{post_id}
                                                    RouteNode {
                                                        segment_type: SegmentType::Variable {
                                                            name: "post_id".to_string(),
                                                            validator: is_valid_post_id
                                                        },
                                                        children: vec![],
                                                        suggestion_fn: None,
                                                        ui_fn: None,
                                                    }
                                                ],
                                                suggestion_fn: Some(suggest_random_comment),
                                                ui_fn: None,
                                            }
                                        ],
                                        suggestion_fn: None,
                                        ui_fn: Some(create_subreddit_guide),
                                    }
                                ],
                                suggestion_fn: Some(suggest_subreddit_slash),
                                ui_fn: None,
                            }
                        ],
                        suggestion_fn: Some(suggest_popular_subreddit),
                        ui_fn: Some(create_subreddit_selection),
                    }
                ],
                suggestion_fn: Some(suggest_subreddit_root),
                ui_fn: None,
            }
        ],
        suggestion_fn: Some(suggest_reddit_root),
        ui_fn: Some(create_reddit_root_guide),
    };

    // Update context based on the path
    RouteTree {
        platforms: HashMap::from([
            ("reddit.com".to_string(), root_node)
        ])
    }
}

static ROUTE_TREE: OnceLock<RouteTree> = OnceLock::new();

fn get_route_tree() -> &'static RouteTree {
    ROUTE_TREE.get_or_init(build_route_tree)
}

// --- Main Parser Functions ---

fn parse_url(url: &str) -> ParseResult {
    get_route_tree().parse(url)
}

pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    let tree = get_route_tree();
    let result = tree.parse(query);
    
    match result {
        ParseResult::Complete(_parsed_url) => {
            // For complete URLs, we may still want to show suggestions/guides
            let normalized = normalize_input(query);
            let segments = tokenize(&normalized);
            
            if let Some(platform_node) = tree.platforms.get("reddit.com") {
                let mut context = HashMap::new();
                context.insert("domain".to_string(), "reddit.com".to_string());
                
                // Walk the tree to find the right node and context
                if let Some((node, context)) = find_node_for_path(platform_node, &segments[1..], context) {
                    if let Some(ui) = node.get_ui(query, &context) {
                        if let Some(suggestion) = node.get_suggestion(&context) {
                            return UIResponse::Multiple(MultipleResponseData {
                                responses: vec![
                                    UIResponse::Suggestions(SuggestionsData {
                                        query: query.to_string(),
                                        suggestion: Some(suggestion),
                                    }),
                                    ui,
                                ]
                            });
                        } else {
                            return ui;
                        }
                    } else if let Some(suggestion) = node.get_suggestion(&context) {
                        return UIResponse::Suggestions(SuggestionsData {
                            query: query.to_string(),
                            suggestion: Some(suggestion),
                        });
                    }
                }
            }
            
            // Fallback suggestion
            UIResponse::Suggestions(SuggestionsData {
                query: query.to_string(),
                suggestion: Some(Suggestion {
                    text: query.to_string(),
                    completion: query.to_string(),
                    description: Some("Complete URL".to_string()),
                    score: 1.0,
                }),
            })
        }
        ParseResult::Partial(partial) => {
            match partial {
                PartialParse::Prefix(_) => {
                    UIResponse::Suggestions(SuggestionsData {
                        query: query.to_string(),
                        suggestion: Some(suggest_reddit_root(&HashMap::new())),
                    })
                }
                PartialParse::Domain(_) => {
                    UIResponse::Suggestions(SuggestionsData {
                        query: query.to_string(),
                        suggestion: Some(suggest_reddit_root(&HashMap::new())),
                    })
                }
                PartialParse::Path(_parsed_url, remaining) => {
                    // Find the appropriate node and generate suggestions
                    let normalized = normalize_input(query);
                    let segments = tokenize(&normalized);
                    
                    if let Some(platform_node) = tree.platforms.get("reddit.com") {
                        let mut context = HashMap::new();
                        context.insert("domain".to_string(), "reddit.com".to_string());
                        
                        if let Some((node, context)) = find_node_for_partial(platform_node, &segments[1..], context) {
                            // Try to find a partial match for the remaining segment
                            if let Some(child) = node.children.iter().find(|child| {
                                let mut temp_context = context.clone();
                                matches!(child.matches_segment(&remaining, &mut temp_context), MatchResult::Partial)
                            }) {
                                if let Some(suggestion) = child.get_suggestion(&context) {
                                    return UIResponse::Suggestions(SuggestionsData {
                                        query: query.to_string(),
                                        suggestion: Some(suggestion),
                                    });
                                }
                            }
                        }
                    }
                    
                    // Fallback
                    UIResponse::Suggestions(SuggestionsData {
                        query: query.to_string(),
                        suggestion: Some(Suggestion {
                            text: format!("{}/", query),
                            completion: format!("{}/", query),
                            description: Some("Continue path".to_string()),
                            score: 1.0,
                        }),
                    })
                }
            }
        }
        ParseResult::Error(error) => {
            let (error_type, message) = match error {
                ParseError::UnsupportedPlatform(msg) => ("UnsupportedPlatform", msg),
                ParseError::MalformedUrl(msg) => ("MalformedUrl", msg),
                ParseError::InvalidFormat(msg) => ("InvalidFormat", msg),
            };
            
            UIResponse::ErrorPage(ErrorPageData {
                error_type: error_type.to_string(),
                message,
                suggestions: vec![],
            })
        }
    }
}

fn find_node_for_path<'a>(node: &'a RouteNode, segments: &[String], mut context: HashMap<String, String>) -> Option<(&'a RouteNode, HashMap<String, String>)> {
    let mut current_node = node;
    
    for segment in segments {
        match current_node.matches_segment(segment, &mut context) {
            MatchResult::Complete => {
                if let Some(child) = current_node.find_best_child(segment) {
                    current_node = child;
                } else {
                    break;
                }
            }
            _ => break,
        }
    }
    
    Some((current_node, context))
}

fn find_node_for_partial<'a>(node: &'a RouteNode, segments: &[String], mut context: HashMap<String, String>) -> Option<(&'a RouteNode, HashMap<String, String>)> {
    let mut current_node = node;
    
    for (i, segment) in segments.iter().enumerate() {
        match current_node.matches_segment(segment, &mut context) {
            MatchResult::Complete => {
                if let Some(child) = current_node.find_best_child(segment) {
                    current_node = child;
                } else {
                    break;
                }
            }
            MatchResult::Partial => {
                // This is the partial segment, return current node
                break;
            }
            MatchResult::None => {
                // If this is the last segment, it might be a partial
                if i == segments.len() - 1 {
                    break;
                } else {
                    return None;
                }
            }
        }
    }
    
    Some((current_node, context))
}

#[cfg(test)]
mod tests {
    use super::*;

    // Test parsing functionality
    #[test]
    fn test_parse_url_prefixes() {
        assert_eq!(parse_url("r"), ParseResult::Partial(PartialParse::Prefix("r".to_string())));
        assert_eq!(parse_url("re"), ParseResult::Partial(PartialParse::Prefix("re".to_string())));
        assert_eq!(parse_url("reddit"), ParseResult::Partial(PartialParse::Prefix("reddit".to_string())));
    }

    #[test]
    fn test_parse_url_domains() {
        // Partial reddit domains are now treated as prefixes for consistency
        assert_eq!(parse_url("reddit."), ParseResult::Partial(PartialParse::Prefix("reddit.".to_string())));
        assert_eq!(parse_url("reddit.c"), ParseResult::Partial(PartialParse::Prefix("reddit.c".to_string())));
        // Complete reddit.com is still a domain
        assert_eq!(parse_url("reddit.com"), ParseResult::Partial(PartialParse::Domain("reddit.com".to_string())));
    }

    #[test]
    fn test_parse_url_complete() {
        assert_eq!(
            parse_url("reddit.com/"),
            ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Root))
        );
        assert_eq!(
            parse_url("reddit.com/r/"),
            ParseResult::Complete(ParsedUrl::Reddit(RedditPath::SubredditRoot))
        );
        assert_eq!(
            parse_url("reddit.com/r/rust"),
            ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Subreddit("rust".to_string())))
        );
        assert_eq!(
            parse_url("reddit.com/r/rust/"),
            ParseResult::Complete(ParsedUrl::Reddit(RedditPath::SubredditWithSlash("rust".to_string())))
        );
        assert_eq!(
            parse_url("reddit.com/r/rust/comments/"),
            ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Comments("rust".to_string(), None)))
        );
    }

    #[test]
    fn test_parse_url_partial_paths() {
        assert_eq!(
            parse_url("reddit.com/r"),
            ParseResult::Partial(PartialParse::Path(
                ParsedUrl::Reddit(RedditPath::Root),
                "r".to_string()
            ))
        );
    }

    // Test UI response generation
    #[test]
    fn test_ui_response_types() {
        // Prefixes should return suggestions
        match parse_for_autocomplete("r") {
            UIResponse::Suggestions(data) => {
                assert_eq!(data.suggestion.as_ref().unwrap().completion, "reddit.com/");
            }
            _ => panic!("Expected Suggestions for 'r'"),
        }

        // Complete reddit.com/ should return Multiple with suggestion and guide
        match parse_for_autocomplete("reddit.com/") {
            UIResponse::Multiple(data) => {
                assert_eq!(data.responses.len(), 2);
                // First should be suggestion
                match &data.responses[0] {
                    UIResponse::Suggestions(sug_data) => {
                        assert_eq!(sug_data.suggestion.as_ref().unwrap().completion, "reddit.com/");
                    }
                    _ => panic!("Expected first response to be Suggestions"),
                }
                // Second should be guide
                match &data.responses[1] {
                    UIResponse::Guide(guide_data) => {
                        assert_eq!(guide_data.title, "Choose Reddit Content Type");
                        assert_eq!(guide_data.options.len(), 2);
                        assert_eq!(guide_data.options[0].key, "r");
                        assert_eq!(guide_data.options[1].key, "u");
                    }
                    _ => panic!("Expected second response to be Guide"),
                }
            }
            _ => panic!("Expected Multiple for reddit.com/"),
        }

        // reddit.com/r/ should return Multiple with suggestion and selection
        match parse_for_autocomplete("reddit.com/r/") {
            UIResponse::Multiple(data) => {
                assert_eq!(data.responses.len(), 2);
                // First should be suggestion
                match &data.responses[0] {
                    UIResponse::Suggestions(sug_data) => {
                        assert_eq!(sug_data.suggestion.as_ref().unwrap().completion, "reddit.com/r/programming");
                    }
                    _ => panic!("Expected first response to be Suggestions"),
                }
                // Second should be selection
                match &data.responses[1] {
                    UIResponse::Selection(sel_data) => {
                        assert_eq!(sel_data.title, "Choose a Subreddit");
                        assert!(sel_data.items.len() > 0);
                    }
                    _ => panic!("Expected second response to be Selection"),
                }
            }
            _ => panic!("Expected Multiple for reddit.com/r/"),
        }

        // reddit.com/r/rust should return just a Suggestions response
        match parse_for_autocomplete("reddit.com/r/rust") {
            UIResponse::Suggestions(data) => {
                assert_eq!(data.suggestion.as_ref().unwrap().completion, "reddit.com/r/rust/");
            }
            _ => panic!("Expected Suggestions for reddit.com/r/rust"),
        }

        // reddit.com/r/rust/ should return Multiple with suggestion and guide
        match parse_for_autocomplete("reddit.com/r/rust/") {
            UIResponse::Multiple(data) => {
                assert_eq!(data.responses.len(), 2);
                // Check guide exists in responses
                let has_guide = data.responses.iter().any(|resp| {
                    matches!(resp, UIResponse::Guide(guide_data) if guide_data.title.contains("rust"))
                });
                assert!(has_guide, "Expected to find Guide in Multiple response");
            }
            _ => panic!("Expected Multiple for reddit.com/r/rust/"),
        }
    }

    #[test]
    fn test_suggestion_flow() {
        let test_cases = vec![
            ("r", "reddit.com/"),
            ("re", "reddit.com/"),
            ("reddit", "reddit.com/"),
            ("reddit.", "reddit.com/"),
            ("reddit.com", "reddit.com/"),
            ("reddit.com/r", "reddit.com/r/"),
        ];

        for (input, expected) in test_cases {
            match parse_for_autocomplete(input) {
                UIResponse::Suggestions(data) => {
                    assert_eq!(
                        data.suggestion.as_ref().unwrap().completion,
                        expected,
                        "Failed for input: {}",
                        input
                    );
                }
                _ => panic!("Expected Suggestions for input: {}", input),
            }
        }
    }

    #[test]
    fn test_partial_choice_matching() {
        // Test that "c" partially matches "comments" and provides suggestion with random comment ID
        match parse_for_autocomplete("reddit.com/r/programming/c") {
            UIResponse::Suggestions(data) => {
                let suggestion = data.suggestion.as_ref().unwrap();
                assert!(suggestion.completion.starts_with("reddit.com/r/programming/comments/"));
                assert!(suggestion.completion.len() > "reddit.com/r/programming/comments/".len());
                assert_eq!(suggestion.description.as_ref().unwrap(), "Random comment!");
            }
            other => panic!("Expected Suggestions for partial choice match, got: {:?}", other),
        }
    }

    #[test]
    fn test_guide_content() {
        // Test root guide
        match parse_for_autocomplete("reddit.com/") {
            UIResponse::Multiple(data) => {
                // Find the guide in the responses
                let guide = data.responses.iter().find_map(|resp| {
                    match resp {
                        UIResponse::Guide(guide_data) => Some(guide_data),
                        _ => None,
                    }
                }).expect("Expected to find Guide in Multiple response");
                
                assert_eq!(guide.options[0].completion, "reddit.com/r/");
                assert_eq!(guide.options[1].completion, "reddit.com/u/");
            }
            _ => panic!("Expected Multiple"),
        }

        // Test subreddit guide
        match parse_for_autocomplete("reddit.com/r/programming/") {
            UIResponse::Multiple(data) => {
                // Find the guide in the responses
                let guide = data.responses.iter().find_map(|resp| {
                    match resp {
                        UIResponse::Guide(guide_data) => Some(guide_data),
                        _ => None,
                    }
                }).expect("Expected to find Guide in Multiple response");
                
                assert_eq!(guide.options[0].completion, "reddit.com/r/programming/comments/");
                assert_eq!(guide.options[1].completion, "reddit.com/r/programming/hot");
                assert_eq!(guide.options[2].completion, "reddit.com/r/programming/top");
            }
            _ => panic!("Expected Multiple"),
        }
    }

    // Test error handling
    #[test]
    fn test_parse_errors() {
        // Test unsupported platform
        assert_eq!(
            parse_url("youtube.com"),
            ParseResult::Error(ParseError::UnsupportedPlatform(
                "Platform 'youtube.com' is not yet supported. Currently only Reddit URLs are supported.".to_string()
            ))
        );

        // Test malformed Reddit URL
        assert_eq!(
            parse_url("reddit.com/invalid"),
            ParseResult::Error(ParseError::MalformedUrl(
                "Invalid Reddit path: 'invalid'".to_string()
            ))
        );

        // Test invalid URL format
        assert_eq!(
            parse_url("not.a.real.domain/path"),
            ParseResult::Error(ParseError::InvalidFormat(
                "Unable to parse URL: 'not.a.real.domain/path'".to_string()
            ))
        );
    }

    #[test]
    fn test_error_ui_responses() {
        // Test unsupported platform error UI
        match parse_for_autocomplete("youtube.com/watch?v=123") {
            UIResponse::ErrorPage(data) => {
                assert_eq!(data.error_type, "UnsupportedPlatform");
                assert!(data.message.contains("youtube.com"));
                assert!(data.message.contains("not yet supported"));
            }
            _ => panic!("Expected ErrorPage for YouTube URL"),
        }

        // Test malformed Reddit URL error UI
        match parse_for_autocomplete("reddit.com/badpath") {
            UIResponse::ErrorPage(data) => {
                assert_eq!(data.error_type, "MalformedUrl");
                assert!(data.message.contains("Invalid Reddit path"));
            }
            _ => panic!("Expected ErrorPage for malformed Reddit URL"),
        }

        // Test invalid format error UI
        match parse_for_autocomplete("definitely.not.supported.com/something") {
            UIResponse::ErrorPage(data) => {
                assert_eq!(data.error_type, "InvalidFormat");
                assert!(data.message.contains("Unable to parse URL"));
            }
            _ => panic!("Expected ErrorPage for invalid format"),
        }
    }

    #[test]
    fn test_supported_platforms_detection() {
        let unsupported_urls = vec![
            "youtube.com",
            "youtu.be",
            "github.com",
            "twitter.com",
            "x.com",
            "facebook.com",
            "www.youtube.com",
        ];

        for url in unsupported_urls {
            match parse_url(url) {
                ParseResult::Error(ParseError::UnsupportedPlatform(_)) => {
                    // Expected
                }
                other => panic!("Expected UnsupportedPlatform error for {}, got {:?}", url, other),
            }
        }
    }

    #[test]
    fn test_protocol_and_www_stripping() {
        // Test that protocols and www are properly stripped
        assert_eq!(
            parse_url("https://reddit.com/"),
            ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Root))
        );
        assert_eq!(
            parse_url("http://www.reddit.com/r/rust"),
            ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Subreddit("rust".to_string())))
        );
        assert_eq!(
            parse_url("https://www.youtube.com/watch"),
            ParseResult::Error(ParseError::UnsupportedPlatform(
                "Platform 'youtube.com' is not yet supported. Currently only Reddit URLs are supported.".to_string()
            ))
        );
    }
}