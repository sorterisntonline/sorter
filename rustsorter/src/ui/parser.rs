use std::collections::HashMap;
use crate::ui::types::{UIResponse, Suggestion, GuideOption, SelectionItem};

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

// --- New State-Based Parser ---

#[derive(Debug, PartialEq, Clone)]
enum UrlState {
    Empty,                           // ""
    Prefix(String),                  // "r", "re", etc. (incomplete domain)
    Domain(String),                  // "reddit.com" (complete domain, no slash)
    PathRoot,                        // "reddit.com/" (root, ready for r/ or u/)
    SubredditRoot,                   // "reddit.com/r/" (ready for subreddit name)
    Subreddit(String),               // "reddit.com/r/rust" (specific sub, no trailing slash)
    SubredditDeep(String),           // "reddit.com/r/rust/" (deep, ready for comments/hot/etc.)
    Comments(String, Option<String>), // "reddit.com/r/rust/comments/" or with post ID
    Unsupported(String),             // e.g., "youtube.com"
    Invalid(String),                 // Malformed
}

// Simple trie for prefix matching
struct PrefixTrie {
    children: HashMap<char, PrefixTrie>,
    is_end: bool,
    completion: Option<String>,
}

impl PrefixTrie {
    fn new() -> Self {
        PrefixTrie {
            children: HashMap::new(),
            is_end: false,
            completion: None,
        }
    }

    fn insert(&mut self, word: &str, completion: &str) {
        let mut node = self;
        for c in word.chars() {
            node = node
                .children
                .entry(c.to_lowercase().next().unwrap_or(c))
                .or_insert(PrefixTrie::new());
        }
        node.is_end = true;
        node.completion = Some(completion.to_string());
    }

    fn find_completion(&self, prefix: &str) -> Option<String> {
        let mut node = self;
        for c in prefix.to_lowercase().chars() {
            if let Some(child) = node.children.get(&c) {
                node = child;
            } else {
                return None;
            }
        }
        if node.is_end {
            node.completion.clone()
        } else {
            None
        }
    }
}

impl UrlState {
    // Each state knows its "canonical" completion/suggestion
    fn suggestion(&self) -> Option<Suggestion> {
        match self {
            UrlState::Prefix(p) => Some(Suggestion::new(
                "reddit.com/",
                &format!("Complete to Reddit (from '{}')", p),
            )),
            UrlState::Domain(d) => {
                if d == "reddit.com" {
                    Some(Suggestion::new(&format!("{}/", d), "Go to Reddit"))
                } else {
                    None
                }
            }
            UrlState::PathRoot => Some(Suggestion::new("reddit.com/r/", "Browse subreddits")),
            UrlState::SubredditRoot => {
                // For consistency in tests, use the first popular subreddit
                let popular = get_popular_subreddits();
                popular.first().map(|item| {
                    Suggestion::new(&item.completion, "Go to r/programming")
                })
            }
            UrlState::Subreddit(sub) => Some(Suggestion::new(
                &format!("reddit.com/r/{}/", sub),
                "View subreddit",
            )),
            UrlState::SubredditDeep(sub) => {
                // Placeholder for random comment ID from SQL
                let random_id = fetch_random_comment_id(sub).unwrap_or_else(|| "abc123".to_string());
                Some(Suggestion::new(
                    &format!("reddit.com/r/{}/comments/{}", sub, random_id),
                    "Random comment!",
                ))
            }
            _ => None,
        }
    }

    // Each state can produce a UI guide/infographic
    fn guide(&self, query: &str) -> Option<UIResponse> {
        match self {
            UrlState::PathRoot => Some(UIResponse::guide(
                query.to_string(),
                "Choose Reddit Content Type".to_string(),
                "What type of Reddit content would you like to explore?".to_string(),
                vec![
                    GuideOption {
                        key: "r".to_string(),
                        label: "Subreddits (r/)".to_string(),
                        description: "Browse and sort subreddit posts".to_string(),
                        completion: "reddit.com/r/".to_string(),
                    },
                    GuideOption {
                        key: "u".to_string(),
                        label: "Users (u/)".to_string(),
                        description: "Browse and sort user posts".to_string(),
                        completion: "reddit.com/u/".to_string(),
                    },
                ],
            )),
            UrlState::SubredditRoot => Some(UIResponse::selection(
                query.to_string(),
                "Choose a Subreddit".to_string(),
                "Select a subreddit to explore, or continue typing to search for a specific one.".to_string(),
                get_popular_subreddits(),
            )),
            UrlState::SubredditDeep(sub) => Some(UIResponse::guide(
                query.to_string(),
                format!("Explore r/{}", sub),
                format!("Choose how you want to browse r/{}", sub),
                vec![
                    GuideOption {
                        key: "comments".to_string(),
                        label: "Comments".to_string(),
                        description: "Browse and sort individual comments".to_string(),
                        completion: format!("reddit.com/r/{}/comments/", sub),
                    },
                    GuideOption {
                        key: "hot".to_string(),
                        label: "Hot Posts".to_string(),
                        description: "View the hottest posts in this subreddit".to_string(),
                        completion: format!("reddit.com/r/{}/hot", sub),
                    },
                    GuideOption {
                        key: "top".to_string(),
                        label: "Top Posts".to_string(),
                        description: "View the top-rated posts".to_string(),
                        completion: format!("reddit.com/r/{}/top", sub),
                    },
                ],
            )),
            UrlState::Comments(sub, _) => Some(UIResponse::not_yet_implemented(
                "Comment Browsing".to_string(),
                format!("Browsing comments for r/{} is coming soon", sub),
                None,
            )),
            _ => None,
        }
    }

    // Convert UrlState to ParseResult
    fn to_parse_result(self, _query: &str, remaining: &str) -> ParseResult {
        match self {
            UrlState::Empty | UrlState::Prefix(_) => {
                if let UrlState::Prefix(p) = self {
                    ParseResult::Partial(PartialParse::Prefix(p))
                } else {
                    ParseResult::Partial(PartialParse::Prefix("".to_string()))
                }
            }
            UrlState::Domain(d) => {
                if d.contains("reddit.com") || d.starts_with("reddit.") || d == "reddit.com" {
                    ParseResult::Partial(PartialParse::Domain(d))
                } else {
                    ParseResult::Error(ParseError::UnsupportedPlatform(
                        format!("Platform '{}' is not yet supported. Currently only Reddit URLs are supported.", d)
                    ))
                }
            }
            UrlState::PathRoot => {
                if remaining.is_empty() {
                    ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Root))
                } else {
                    ParseResult::Partial(PartialParse::Path(
                        ParsedUrl::Reddit(RedditPath::Root),
                        remaining.to_string(),
                    ))
                }
            }
            UrlState::SubredditRoot => {
                if remaining.is_empty() {
                    ParseResult::Complete(ParsedUrl::Reddit(RedditPath::SubredditRoot))
                } else {
                    ParseResult::Partial(PartialParse::Path(
                        ParsedUrl::Reddit(RedditPath::SubredditRoot),
                        remaining.to_string(),
                    ))
                }
            }
            UrlState::Subreddit(sub) => {
                if remaining.is_empty() {
                    ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Subreddit(sub)))
                } else {
                    ParseResult::Partial(PartialParse::Path(
                        ParsedUrl::Reddit(RedditPath::Subreddit(sub)),
                        remaining.to_string(),
                    ))
                }
            }
            UrlState::SubredditDeep(sub) => {
                if remaining.is_empty() {
                    ParseResult::Complete(ParsedUrl::Reddit(RedditPath::SubredditWithSlash(sub)))
                } else {
                    ParseResult::Partial(PartialParse::Path(
                        ParsedUrl::Reddit(RedditPath::SubredditWithSlash(sub)),
                        remaining.to_string(),
                    ))
                }
            }
            UrlState::Comments(sub, post_id) => {
                ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Comments(sub, post_id)))
            }
            UrlState::Unsupported(platform) => {
                ParseResult::Error(ParseError::UnsupportedPlatform(
                    format!("Platform '{}' is not yet supported. Currently only Reddit URLs are supported.", platform)
                ))
            }
            UrlState::Invalid(msg) => {
                if msg.starts_with("Unable to parse URL") {
                    ParseResult::Error(ParseError::InvalidFormat(msg))
                } else {
                    ParseResult::Error(ParseError::MalformedUrl(msg))
                }
            }
        }
    }
}

// Helper functions
fn is_subreddit_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

// Placeholder for SQL integration - to be replaced with actual database call
fn fetch_random_comment_id(_subreddit: &str) -> Option<String> {
    // TODO: Integrate with SQL to fetch a random comment ID
    // For now, return a placeholder
    Some("abc123".to_string())
}

// Build the trie once and cache it
fn build_domain_trie() -> PrefixTrie {
    let mut trie = PrefixTrie::new();
    
    // Reddit prefixes
    trie.insert("r", "reddit.com");
    trie.insert("re", "reddit.com");
    trie.insert("red", "reddit.com");
    trie.insert("redd", "reddit.com");
    trie.insert("reddi", "reddit.com");
    trie.insert("reddit", "reddit.com");
    trie.insert("reddit.", "reddit.com");
    trie.insert("reddit.c", "reddit.com");
    trie.insert("reddit.co", "reddit.com");
    trie.insert("reddit.com", "reddit.com");
    
    // Future platforms (will be marked as unsupported in parsing)
    trie.insert("youtube", "youtube.com");
    trie.insert("youtu", "youtube.com");
    trie.insert("github", "github.com");
    trie.insert("twitter", "twitter.com");
    
    trie
}

// --- New State-Based Parser Implementation ---

pub fn parse_url(query: &str) -> ParseResult {
    let query = query.trim();
    
    // Handle empty input
    if query.is_empty() {
        return ParseResult::Partial(PartialParse::Prefix("".to_string()));
    }

    let trie = build_domain_trie();
    let mut state = UrlState::Empty;
    let mut remaining = String::new();

    // Normalize and split input
    let normalized = query.to_lowercase();
    let segments: Vec<&str> = if normalized.contains('/') {
        normalized.split('/').collect()
    } else {
        vec![normalized.as_str()]
    };

    for (i, &seg) in segments.iter().enumerate() {
        match state {
            UrlState::Empty => {
                // Check reddit domains first (before trie lookup)
                if seg == "reddit.com" {
                    state = UrlState::Domain(seg.to_string());
                } else if seg.starts_with("reddit.") {
                    // Partial reddit domain (e.g., "reddit.", "reddit.c", "reddit.co")
                    state = UrlState::Domain(seg.to_string());
                    remaining = segments[i+1..].join("/");
                    break;
                } else if let Some(completion) = trie.find_completion(seg) {
                    if completion != "reddit.com" {
                        // Unsupported platform detected
                        state = UrlState::Unsupported(completion);
                        break;
                    } else {
                        // All reddit-related prefixes stay as prefixes for now
                        // Only direct domain input like "reddit.com" becomes a domain
                        state = UrlState::Prefix(seg.to_string());
                        remaining = segments[i+1..].join("/");
                        break;
                    }
                } else if is_domain_like(seg) {
                    // Check if it's a known platform first
                    if is_known_unsupported_platform(seg) {
                        state = UrlState::Unsupported(seg.to_string());
                    } else {
                        // Unrecognized domain-like input - treat as invalid format
                        state = UrlState::Invalid(format!("Unable to parse URL: '{}'", segments.join("/")));
                    }
                    break;
                } else {
                    // Simple prefix (e.g., "r", "re")
                    state = UrlState::Prefix(seg.to_string());
                    remaining = segments[i+1..].join("/");
                    break;
                }
            }
            UrlState::Domain(_) => {
                if seg.is_empty() {
                    // Trailing slash after domain
                    state = UrlState::PathRoot;
                } else if seg == "r" {
                    // Check if there are more segments - if not, this is partial
                    if i == segments.len() - 1 {
                        // Last segment is just "r" without trailing slash - partial path
                        remaining = seg.to_string();
                        state = UrlState::PathRoot;
                        break;
                    } else {
                        state = UrlState::SubredditRoot;
                    }
                } else if seg == "u" {
                    // Future: UserRoot state
                    state = UrlState::Invalid("User paths not yet implemented".to_string());
                    break;
                } else {
                    state = UrlState::Invalid(format!("Invalid Reddit path: '{}'", seg));
                    break;
                }
            }
            UrlState::PathRoot => {
                if seg == "r" {
                    state = UrlState::SubredditRoot;
                } else if seg == "u" {
                    state = UrlState::Invalid("User paths not yet implemented".to_string());
                    break;
                } else {
                    state = UrlState::Invalid(format!("Expected 'r' or 'u', got '{}'", seg));
                    break;
                }
            }
            UrlState::SubredditRoot => {
                if seg.is_empty() {
                    // reddit.com/r/ - complete
                    break;
                } else if is_valid_subreddit_name(seg) {
                    state = UrlState::Subreddit(seg.to_string());
                } else {
                    // Partial subreddit name
                    remaining = segments[i..].join("/");
                    break;
                }
            }
            UrlState::Subreddit(ref sub) => {
                if seg.is_empty() {
                    // reddit.com/r/rust/ - subreddit with trailing slash
                    state = UrlState::SubredditDeep(sub.clone());
                } else if seg == "comments" {
                    state = UrlState::Comments(sub.clone(), None);
                } else if seg == "hot" || seg == "top" || seg == "new" {
                    // These are complete endpoints
                    break;
                } else {
                    remaining = segments[i..].join("/");
                    break;
                }
            }
            UrlState::SubredditDeep(ref sub) => {
                if seg == "comments" {
                    state = UrlState::Comments(sub.clone(), None);
                } else if seg == "hot" || seg == "top" || seg == "new" {
                    // Complete sorting endpoints
                    break;
                } else {
                    remaining = segments[i..].join("/");
                    break;
                }
            }
            UrlState::Comments(ref sub, ref post_id) => {
                if post_id.is_none() && !seg.is_empty() {
                    // First segment after comments/ is post ID
                    state = UrlState::Comments(sub.clone(), Some(seg.to_string()));
                } else {
                    remaining = segments[i..].join("/");
                    break;
                }
            }
            _ => {
                remaining = segments[i..].join("/");
                break;
            }
        }
    }

    // Convert state to ParseResult
    state.to_parse_result(query, &remaining)
}

fn is_domain_like(input: &str) -> bool {
    input.contains('.') || input.len() > 6 // Rough heuristic
}

fn is_valid_subreddit_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(is_subreddit_char) && name.len() <= 21
}

fn is_known_unsupported_platform(domain: &str) -> bool {
    let unsupported_platforms = [
        "youtube.com",
        "youtu.be", 
        "github.com",
        "twitter.com",
        "x.com",
        "facebook.com",
        "instagram.com",
        "tiktok.com"
    ];
    
    for platform in &unsupported_platforms {
        if domain.starts_with(platform) || domain.starts_with(&format!("www.{}", platform)) {
            return true;
        }
    }
    false
}

// --- New UI Integration ---

pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    // Use the new state-based parser for a more direct approach
    let parse_result = parse_url(query);
    
    // For better UX, we'll also try to get the state directly for enhanced suggestions
    let enhanced_response = try_enhanced_response(query);
    
    match enhanced_response {
        Some(response) => response,
        None => parse_result_to_ui_response(parse_result, query),
    }
}

// Enhanced response generation that works directly with states
fn try_enhanced_response(query: &str) -> Option<UIResponse> {
    let query = query.trim();
    if query.is_empty() {
        return Some(UIResponse::suggestions(
            query.to_string(),
            Some(Suggestion::new("reddit.com/", "Start typing to explore Reddit"))
        ));
    }

    let trie = build_domain_trie();
    let normalized = query.to_lowercase();
    
    // Quick state detection for enhanced UX
    if let Some(completion) = trie.find_completion(&normalized) {
        if completion == "reddit.com" {
            if query.ends_with('/') {
                // "reddit.com/" - show guide
                let state = UrlState::PathRoot;
                return state.guide(query);
            } else {
                // "reddit" variants - suggest completion
                let state = UrlState::Domain(completion);
                return state.suggestion().map(|sug| UIResponse::suggestions(query.to_string(), Some(sug)));
            }
        } else {
            // Unsupported platform
            return Some(UIResponse::error(
                "UnsupportedPlatform".to_string(),
                format!("Platform '{}' is not yet supported. Currently only Reddit URLs are supported.", completion)
            ));
        }
    }

    // Check for specific patterns
    if normalized.starts_with("reddit.com/r") && !normalized.starts_with("reddit.com/r/") {
        // This is reddit.com/r without the trailing slash - should suggest reddit.com/r/
        return Some(UIResponse::suggestions(
            query.to_string(),
            Some(Suggestion::new("reddit.com/r/", "Browse subreddits"))
        ));
    }
    
    if normalized.starts_with("reddit.com/r/") && !normalized.ends_with('/') {
        let sub_part = &normalized["reddit.com/r/".len()..];
        if is_valid_subreddit_name(sub_part) {
            let state = UrlState::Subreddit(sub_part.to_string());
            let suggestion = state.suggestion();
            return suggestion.map(|sug| UIResponse::suggestions(query.to_string(), Some(sug)));
        }
    }

    if normalized == "reddit.com/r/" {
        let state = UrlState::SubredditRoot;
        if let Some(guide) = state.guide(query) {
            if let Some(suggestion) = state.suggestion() {
                return Some(UIResponse::multiple(vec![
                    UIResponse::suggestions(query.to_string(), Some(suggestion)),
                    guide,
                ]));
            }
            return Some(guide);
        }
    }

    if normalized.starts_with("reddit.com/r/") && normalized.ends_with('/') {
        let sub_part = &normalized["reddit.com/r/".len()..normalized.len()-1];
        if is_valid_subreddit_name(sub_part) {
            let state = UrlState::SubredditDeep(sub_part.to_string());
            if let Some(guide) = state.guide(query) {
                if let Some(suggestion) = state.suggestion() {
                    return Some(UIResponse::multiple(vec![
                        UIResponse::suggestions(query.to_string(), Some(suggestion)),
                        guide,
                    ]));
                }
                return Some(guide);
            }
        }
    }

    None // Fall back to parse_result_to_ui_response
}

// --- Conversion from ParseResult to UIResponse (simplified) ---

fn parse_result_to_ui_response(result: ParseResult, query: &str) -> UIResponse {
    match result {
        ParseResult::Partial(partial) => handle_partial_parse(partial, query),
        ParseResult::Complete(parsed) => handle_complete_parse(parsed, query),
        ParseResult::Error(error) => handle_parse_error(error, query),
    }
}

fn handle_partial_parse(partial: PartialParse, query: &str) -> UIResponse {
    match partial {
        PartialParse::Prefix(_) => {
            UIResponse::suggestions(
                query.to_string(), 
                Some(Suggestion::new("reddit.com/", "Go to Reddit"))
            )
        }
        PartialParse::Domain(_) => {
            UIResponse::suggestions(
                query.to_string(),
                Some(Suggestion::new("reddit.com/", "Go to Reddit"))
            )
        }
        PartialParse::Path(ParsedUrl::Reddit(RedditPath::Root), remaining) => {
            if remaining.starts_with("r") {
                UIResponse::suggestions(
                    query.to_string(),
                    Some(Suggestion::new("reddit.com/r/", "Browse subreddits"))
                )
            } else {
                UIResponse::suggestions(query.to_string(), None)
            }
        }
        PartialParse::Path(_, _) => {
            UIResponse::suggestions(query.to_string(), None)
        }
    }
}

fn handle_complete_parse(parsed: ParsedUrl, query: &str) -> UIResponse {
    match parsed {
        ParsedUrl::Reddit(path) => {
            // Convert RedditPath to UrlState for consistent handling
            let state = match path {
                RedditPath::Root => UrlState::PathRoot,
                RedditPath::SubredditRoot => UrlState::SubredditRoot,
                RedditPath::Subreddit(sub) => UrlState::Subreddit(sub),
                RedditPath::SubredditWithSlash(sub) => UrlState::SubredditDeep(sub),
                RedditPath::Comments(sub, post_id) => UrlState::Comments(sub, post_id),
            };

            // Try to get both suggestion and guide
            let suggestion_response = state.suggestion()
                .map(|sug| UIResponse::suggestions(query.to_string(), Some(sug)));
            let guide_response = state.guide(query);

            match (suggestion_response, guide_response) {
                (Some(sug), Some(guide)) => UIResponse::multiple(vec![sug, guide]),
                (Some(sug), None) => sug,
                (None, Some(guide)) => guide,
                (None, None) => UIResponse::suggestions(query.to_string(), None),
            }
        }
    }
}

fn handle_parse_error(error: ParseError, _query: &str) -> UIResponse {
    match error {
        ParseError::InvalidFormat(msg) => {
            UIResponse::error(
                "InvalidFormat".to_string(),
                format!("{} Try typing a Reddit URL like 'reddit.com/r/programming'", msg)
            )
        }
        ParseError::UnsupportedPlatform(msg) => {
            UIResponse::error(
                "UnsupportedPlatform".to_string(),
                format!("{} Support for more platforms is coming soon!", msg)
            )
        }
        ParseError::MalformedUrl(msg) => {
            UIResponse::error(
                "MalformedUrl".to_string(),
                format!("{} Please check the URL format and try again.", msg)
            )
        }
    }
}

fn get_popular_subreddits() -> Vec<SelectionItem> {
    vec![
        SelectionItem {
            id: "programming".to_string(),
            title: "r/programming".to_string(),
            description: Some("General programming discussions and news".to_string()),
            completion: "reddit.com/r/programming".to_string(),
        },
        SelectionItem {
            id: "rust".to_string(),
            title: "r/rust".to_string(),
            description: Some("Systems programming language focused on safety and performance".to_string()),
            completion: "reddit.com/r/rust".to_string(),
        },
        SelectionItem {
            id: "askreddit".to_string(),
            title: "r/AskReddit".to_string(),
            description: Some("Ask and answer thought-provoking questions".to_string()),
            completion: "reddit.com/r/AskReddit".to_string(),
        },
    ]
}


pub fn parse_for_search(_query: &str) -> UIResponse {
    unimplemented!()
}

impl Suggestion {
    fn new(completion: &str, description: &str) -> Self {
        Suggestion {
            text: completion.to_string(),
            completion: completion.to_string(),
            description: Some(description.to_string()),
            score: 100.0,
        }
    }
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
        assert_eq!(parse_url("reddit."), ParseResult::Partial(PartialParse::Domain("reddit.".to_string())));
        assert_eq!(parse_url("reddit.c"), ParseResult::Partial(PartialParse::Domain("reddit.c".to_string())));
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
                        assert_eq!(sug_data.suggestion.as_ref().unwrap().completion, "reddit.com/r/");
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
}