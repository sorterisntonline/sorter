use std::collections::HashMap;
use std::sync::OnceLock;
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

// --- Declarative Schema System ---

#[derive(Clone)]
struct UrlSchema {
    platforms: HashMap<String, Platform>,
}

#[derive(Clone)]
struct Platform {
    domain: String,
    root_suggestion: String,
    root_guide: Option<Guide>,
    paths: Vec<PathDef>,
}

#[derive(Clone)]
struct PathDef {
    pattern: PathPattern,
    suggestion_template: String,
    description: String,
    ui_response: UiResponseType,
    children: Vec<PathDef>,
}

#[derive(Clone)]
enum PathPattern {
    Literal(String),                    // Exact match: "r"
    Choice(Vec<String>),                // One of: ["hot", "top", "new"]
    Variable(String, VariableType),     // Capture: {subreddit}
    Optional(Box<PathPattern>),         // Maybe: [trailing_slash]
}

#[derive(Clone)]
enum VariableType {
    Subreddit,      // Alphanumeric + underscore, max 21 chars
    PostId,         // Alphanumeric, typically 6-7 chars
    Username,       // Similar to subreddit
}

#[derive(Clone)]
enum UiResponseType {
    Suggestion,
    Guide(Guide),
    Selection(SelectionSource),
    NotImplemented(String),
}

#[derive(Clone)]
enum SelectionSource {
    Static(Vec<SelectionItem>),
    Dynamic(String), // Query name like "popular_subreddits"
}

#[derive(Clone)]
struct Guide {
    title: String,
    description: String,
    options: Vec<GuideOption>,
}

// --- Declarative Parser Implementation ---

struct DeclarativeParser {
    schema: UrlSchema,
}

// Context tracks where we are in the parse tree
#[derive(Clone)]
struct ParseContext {
    matched_paths: Vec<(PathDef, HashMap<String, String>)>,
    variables: HashMap<String, String>,
    current_url: Vec<String>,
}

impl ParseContext {
    fn new() -> Self {
        ParseContext {
            matched_paths: vec![],
            variables: HashMap::new(),
            current_url: vec![],
        }
    }
    
    fn push_match(&mut self, path: PathDef, captures: HashMap<String, String>) {
        for (key, value) in &captures {
            self.variables.insert(key.clone(), value.clone());
        }
        self.matched_paths.push((path, captures));
    }
    
    fn set_variable(&mut self, key: &str, value: &str) {
        self.variables.insert(key.to_string(), value.to_string());
    }
    
    fn to_parsed_url(&self, domain: &str, has_trailing_slash: bool) -> ParsedUrl {
        if domain == "reddit.com" {
            // Determine RedditPath based on matched paths
            if self.matched_paths.is_empty() {
                return ParsedUrl::Reddit(RedditPath::Root);
            }
            
            let path_types: Vec<&str> = self.matched_paths.iter()
                .map(|(path, _)| match &path.pattern {
                    PathPattern::Literal(s) => s.as_str(),
                    PathPattern::Variable(name, _) => name.as_str(),
                    PathPattern::Choice(_) => "choice",
                    _ => "unknown",
                })
                .collect();
            
            match path_types.as_slice() {
                ["r"] => ParsedUrl::Reddit(RedditPath::SubredditRoot),
                ["r", "subreddit"] => {
                    let sub = self.variables.get("subreddit").map(|s| s.clone()).unwrap_or_else(|| "unknown".to_string());
                    if has_trailing_slash {
                        ParsedUrl::Reddit(RedditPath::SubredditWithSlash(sub))
                } else {
                        ParsedUrl::Reddit(RedditPath::Subreddit(sub))
                    }
                }
                ["r", "subreddit", "choice"] => {
                    let sub = self.variables.get("subreddit").map(|s| s.clone()).unwrap_or_else(|| "unknown".to_string());
                    let choice = self.variables.get("choice").map(|s| s.as_str()).unwrap_or("unknown");
                    if choice == "comments" {
                        ParsedUrl::Reddit(RedditPath::Comments(sub, None))
                } else {
                        ParsedUrl::Reddit(RedditPath::SubredditWithSlash(sub))
                    }
                }
                ["r", "subreddit", "choice", "post_id"] => {
                    let sub = self.variables.get("subreddit").map(|s| s.clone()).unwrap_or_else(|| "unknown".to_string());
                    let post_id = self.variables.get("post_id").map(|s| s.clone());
                    ParsedUrl::Reddit(RedditPath::Comments(sub, post_id))
                }
                _ => ParsedUrl::Reddit(RedditPath::Root),
            }
                } else {
            // Future: other platforms
            ParsedUrl::Reddit(RedditPath::Root)
        }
    }
}

impl DeclarativeParser {
    fn parse(&self, input: &str) -> ParseResult {
        let normalized = self.normalize_input(input);
        let segments = self.tokenize(&normalized);
        
        // Try each platform
        for (_, platform) in &self.schema.platforms {
            if let Some(result) = self.try_parse_platform(platform, &segments, input) {
                return result;
            }
        }
        
        // Check if it's a prefix of a supported platform
        if self.find_platform_by_prefix(&segments).is_some() {
            return ParseResult::Partial(PartialParse::Prefix(segments.join("")));
        }
        
        ParseResult::Error(ParseError::InvalidFormat(format!("Unable to parse URL: '{}'", input)))
    }
    
    fn normalize_input(&self, input: &str) -> String {
        input
            .trim()
            .replace("https://", "")
            .replace("http://", "")
            .replace("www.", "")
            .to_lowercase()
    }
    
    fn tokenize(&self, normalized: &str) -> Vec<String> {
        if normalized.is_empty() {
            return vec![];
        }
        
        if normalized.contains('/') {
            normalized.split('/').map(|s| s.to_string()).collect()
                } else {
            vec![normalized.to_string()]
        }
    }
    
    fn find_platform_by_prefix(&self, segments: &[String]) -> Option<&Platform> {
        if segments.is_empty() {
            return None;
        }
        
        let first_segment = &segments[0];
        for (_, platform) in &self.schema.platforms {
            if platform.domain.starts_with(first_segment) || first_segment.starts_with(&platform.domain) {
                return Some(platform);
            }
        }
        None
    }
    
    fn try_parse_platform(&self, platform: &Platform, segments: &[String], original_input: &str) -> Option<ParseResult> {
        if segments.is_empty() {
            return Some(ParseResult::Partial(PartialParse::Prefix("".to_string())));
        }
        
        let first_segment = &segments[0];
        
        // Check domain matching
        if platform.domain == *first_segment {
            // Exact domain match
            if segments.len() == 1 {
                return Some(ParseResult::Partial(PartialParse::Domain(first_segment.clone())));
            }
            
            // Domain with path
            let mut context = ParseContext::new();
            context.current_url.push(platform.domain.clone());
            
            let remaining_segments = &segments[1..];
            if remaining_segments.is_empty() || (remaining_segments.len() == 1 && remaining_segments[0].is_empty()) {
                // "reddit.com/"
                return Some(ParseResult::Complete(ParsedUrl::Reddit(RedditPath::Root)));
            }
            
            // Check if the original query ends with a slash to determine if this is a complete or partial path
            let query_ends_with_slash = original_input.ends_with('/');
            return Some(self.walk_paths_with_completeness(&platform.paths, remaining_segments, &mut context, &platform.domain, query_ends_with_slash));
        } else if platform.domain.starts_with(first_segment) {
            // Partial domain match
            return Some(ParseResult::Partial(PartialParse::Prefix(first_segment.clone())));
        } else if self.is_unsupported_platform(first_segment) {
            return Some(ParseResult::Error(ParseError::UnsupportedPlatform(
                format!("Platform '{}' is not yet supported. Currently only Reddit URLs are supported.", first_segment)
            )));
        }
        
        None
    }
    
    fn walk_paths_with_completeness(&self, paths: &[PathDef], segments: &[String], context: &mut ParseContext, domain: &str, query_ends_with_slash: bool) -> ParseResult {
        if segments.is_empty() {
            // We're at the end of input - return current state
            return ParseResult::Complete(context.to_parsed_url(domain, query_ends_with_slash));
        }
        
        let current_segment = &segments[0];
        
        // Try each possible path
        for path_def in paths {
            if let Some(captures) = self.match_pattern(&path_def.pattern, current_segment) {
                // This path matches!
                let mut new_context = context.clone();
                new_context.push_match(path_def.clone(), captures);
                new_context.current_url.push(current_segment.clone());
                
                if segments.len() == 1 {
                    // This is the last segment
                    if self.is_complete_pattern(&path_def.pattern, current_segment) {
                        // For literal patterns like "r", require trailing slash for completion
                        // For variable patterns like subreddit names, they can be complete without slash
                        match &path_def.pattern {
                            PathPattern::Literal(_) => {
                                if query_ends_with_slash {
                                    return ParseResult::Complete(new_context.to_parsed_url(domain, query_ends_with_slash));
    } else {
                                    return ParseResult::Partial(PartialParse::Path(
                                        context.to_parsed_url(domain, query_ends_with_slash),
                                        current_segment.clone(),
                                    ));
                                }
                            }
                            PathPattern::Variable(_, _) | PathPattern::Choice(_) => {
                                // Variables and choices are complete even without trailing slash
                                return ParseResult::Complete(new_context.to_parsed_url(domain, query_ends_with_slash));
                            }
                            _ => {
                                return ParseResult::Complete(new_context.to_parsed_url(domain, query_ends_with_slash));
                            }
                        }
                    } else {
                        // Partial match - pattern is incomplete
                        return ParseResult::Partial(PartialParse::Path(
                            context.to_parsed_url(domain, query_ends_with_slash),
                            current_segment.clone(),
                        ));
                    }
                } else if segments.len() == 2 && segments[1].is_empty() && query_ends_with_slash {
                    // Special case: path like "r/" where second segment is empty due to trailing slash
                    return ParseResult::Complete(new_context.to_parsed_url(domain, query_ends_with_slash));
                }
                
                // Continue to children with remaining segments
                return self.walk_paths_with_completeness(&path_def.children, &segments[1..], &mut new_context, domain, query_ends_with_slash);
            }
        }
        
        // No exact matches - look for partial matches
        if self.find_partial_match(paths, current_segment, context).is_some() {
            return ParseResult::Partial(PartialParse::Path(
                context.to_parsed_url(domain, query_ends_with_slash),
                current_segment.clone(),
            ));
        }
        
        // Invalid path
        ParseResult::Error(ParseError::MalformedUrl(
            format!("Invalid Reddit path: '{}'", current_segment)
        ))
    }
    
    fn match_pattern(&self, pattern: &PathPattern, segment: &str) -> Option<HashMap<String, String>> {
        match pattern {
            PathPattern::Literal(literal) => {
                if segment == literal {
                    Some(HashMap::new())
                } else {
                    None
                }
            }
            PathPattern::Choice(choices) => {
                if choices.iter().any(|c| c == segment) {
                    let mut captures = HashMap::new();
                    captures.insert("choice".to_string(), segment.to_string());
                    Some(captures)
                } else {
                    None
                }
            }
            PathPattern::Variable(name, var_type) => {
                if self.validate_variable(segment, var_type) {
                    let mut captures = HashMap::new();
                    captures.insert(name.clone(), segment.to_string());
                    Some(captures)
                } else {
                    None
                }
            }
            PathPattern::Optional(inner) => {
                // For now, treat as always matching
                self.match_pattern(inner, segment)
            }
        }
    }
    
    fn is_complete_pattern(&self, pattern: &PathPattern, segment: &str) -> bool {
        match pattern {
            PathPattern::Literal(literal) => segment == literal,
            PathPattern::Choice(choices) => choices.iter().any(|c| c == segment),
            PathPattern::Variable(_, var_type) => self.validate_variable(segment, var_type),
            PathPattern::Optional(_) => true,
        }
    }
    
    fn validate_variable(&self, segment: &str, var_type: &VariableType) -> bool {
        match var_type {
            VariableType::Subreddit => {
                !segment.is_empty() && 
                segment.len() <= 21 && 
                segment.chars().all(|c| c.is_alphanumeric() || c == '_')
            }
            VariableType::PostId => {
                !segment.is_empty() && 
                segment.len() <= 10 && 
                segment.chars().all(|c| c.is_alphanumeric())
            }
            VariableType::Username => {
                !segment.is_empty() && 
                segment.len() <= 20 && 
                segment.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
            }
        }
    }
    
    fn find_partial_match(&self, paths: &[PathDef], segment: &str, context: &ParseContext) -> Option<String> {
        for path_def in paths {
            match &path_def.pattern {
                PathPattern::Literal(literal) => {
                    if literal.starts_with(segment) {
                        return Some(self.expand_template(&path_def.suggestion_template, context));
                    }
                }
                PathPattern::Choice(choices) => {
                    for choice in choices {
                        if choice.starts_with(segment) {
                            let mut temp_context = context.clone();
                            temp_context.set_variable("choice", choice);
                            return Some(self.expand_template(&path_def.suggestion_template, &temp_context));
                        }
                    }
                }
                _ => {}
            }
        }
        None
    }
    
    fn expand_template(&self, template: &str, context: &ParseContext) -> String {
        let mut result = template.to_string();
        for (key, value) in &context.variables {
            let placeholder = format!("{{{}}}", key);
            result = result.replace(&placeholder, value);
        }
        result
    }
    
    fn is_unsupported_platform(&self, domain: &str) -> bool {
        let unsupported_platforms = [
            "youtube.com", "youtu.be", "github.com", "twitter.com",
            "x.com", "facebook.com", "instagram.com", "tiktok.com"
        ];
        
        unsupported_platforms.iter().any(|platform| {
            domain.starts_with(platform) || domain.starts_with(&format!("www.{}", platform))
        })
    }
}

// The beautiful part: define Reddit's entire URL structure declaratively
fn reddit_schema() -> Platform {
    Platform {
        domain: "reddit.com".to_string(),
        root_suggestion: "reddit.com/".to_string(),
        root_guide: Some(Guide {
            title: "Choose Reddit Content Type".to_string(),
            description: "What type of Reddit content would you like to explore?".to_string(),
            options: vec![
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
        }),
        paths: vec![
            PathDef {
                pattern: PathPattern::Literal("r".to_string()),
                suggestion_template: "reddit.com/r/".to_string(),
                description: "Browse subreddits".to_string(),
                ui_response: UiResponseType::Selection(SelectionSource::Dynamic("popular_subreddits".to_string())),
                children: vec![
                    PathDef {
                        pattern: PathPattern::Variable("subreddit".to_string(), VariableType::Subreddit),
                        suggestion_template: "reddit.com/r/{subreddit}/".to_string(),
                        description: "View subreddit".to_string(),
                        ui_response: UiResponseType::Suggestion,
                        children: vec![
                            PathDef {
                                pattern: PathPattern::Choice(vec![
                                    "comments".to_string(),
                                    "hot".to_string(),
                                    "top".to_string(),
                                    "new".to_string(),
                                ]),
                                suggestion_template: "reddit.com/r/{subreddit}/{choice}/".to_string(),
                                description: "Browse {choice}".to_string(),
                                ui_response: UiResponseType::Guide(Guide {
                                    title: "Explore r/{subreddit}".to_string(),
                                    description: "Choose how you want to browse r/{subreddit}".to_string(),
                                    options: vec![
                                        GuideOption {
                                            key: "comments".to_string(),
                                            label: "Comments".to_string(),
                                            description: "Browse individual comments".to_string(),
                                            completion: "reddit.com/r/{subreddit}/comments/".to_string(),
                                        },
                                        GuideOption {
                                            key: "hot".to_string(),
                                            label: "Hot Posts".to_string(),
                                            description: "View the hottest posts in this subreddit".to_string(),
                                            completion: "reddit.com/r/{subreddit}/hot".to_string(),
                                        },
                                        GuideOption {
                                            key: "top".to_string(),
                                            label: "Top Posts".to_string(),
                                            description: "View the top-rated posts".to_string(),
                                            completion: "reddit.com/r/{subreddit}/top".to_string(),
                                        },
                                        GuideOption {
                                            key: "new".to_string(),
                                            label: "New Posts".to_string(),
                                            description: "View the newest posts".to_string(),
                                            completion: "reddit.com/r/{subreddit}/new".to_string(),
                                        },
                                    ],
                                }),
                                children: vec![
                                    PathDef {
                                        pattern: PathPattern::Variable("post_id".to_string(), VariableType::PostId),
                                        suggestion_template: "reddit.com/r/{subreddit}/comments/{post_id}".to_string(),
                                        description: "View comment thread".to_string(),
                                        ui_response: UiResponseType::NotImplemented("Comment browsing".to_string()),
                                        children: vec![],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            PathDef {
                pattern: PathPattern::Literal("u".to_string()),
                suggestion_template: "reddit.com/u/".to_string(),
                description: "Browse users".to_string(),
                ui_response: UiResponseType::NotImplemented("User browsing".to_string()),
                children: vec![],
            },
        ],
    }
}

// Cached schema
static SCHEMA: OnceLock<UrlSchema> = OnceLock::new();

fn get_schema() -> &'static UrlSchema {
    SCHEMA.get_or_init(|| {
        UrlSchema {
            platforms: HashMap::from([
                ("reddit.com".to_string(), reddit_schema()),
            ]),
        }
    })
}

// Placeholder for SQL integration - to be replaced with actual database call
fn fetch_random_comment_id(_subreddit: &str) -> Option<String> {
    // TODO: Integrate with SQL to fetch a random comment ID
    // For now, return a placeholder
    Some("abc123".to_string())
}

// --- Public API ---

pub fn parse_url(query: &str) -> ParseResult {
    let parser = DeclarativeParser {
        schema: get_schema().clone(),
    };
    parser.parse(query)
}

pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    let parser = DeclarativeParser {
        schema: get_schema().clone(),
    };
    
    let parse_result = parser.parse(query);
    
    // Convert ParseResult to UIResponse using the declarative schema
    schema_to_ui_response(parse_result, query, &parser)
}

fn schema_to_ui_response(parse_result: ParseResult, query: &str, parser: &DeclarativeParser) -> UIResponse {
    match parse_result {
        ParseResult::Partial(partial) => handle_partial_parse_declarative(partial, query, parser),
        ParseResult::Complete(parsed) => handle_complete_parse_declarative(parsed, query, parser),
        ParseResult::Error(error) => handle_parse_error_declarative(error),
    }
}

fn handle_partial_parse_declarative(partial: PartialParse, query: &str, parser: &DeclarativeParser) -> UIResponse {
    match partial {
        PartialParse::Prefix(prefix) => {
            if prefix.is_empty() {
            UIResponse::suggestions(
                query.to_string(), 
                    Some(Suggestion::new("reddit.com/", "Start typing to explore Reddit"))
                )
            } else {
                // Find the platform this prefix belongs to
                if let Some((_, platform)) = parser.schema.platforms.iter()
                    .find(|(_, p)| p.domain.starts_with(&prefix) || prefix.starts_with(&p.domain)) {
            UIResponse::suggestions(
                query.to_string(),
                        Some(Suggestion::new(&platform.root_suggestion, &format!("Complete to {}", platform.domain)))
                    )
                } else {
                    UIResponse::suggestions(query.to_string(), None)
                }
            }
        }
        PartialParse::Domain(domain) => {
            if let Some(platform) = parser.schema.platforms.get(&domain) {
                UIResponse::suggestions(
                    query.to_string(),
                    Some(Suggestion::new(&platform.root_suggestion, &format!("Go to {}", domain)))
                )
            } else {
                UIResponse::suggestions(query.to_string(), None)
            }
        }
        PartialParse::Path(parsed_url, _remaining) => {
            // This is a partial path - we can get suggestions from the current context
            handle_complete_parse_declarative(parsed_url, query, parser)
        }
    }
}

fn handle_complete_parse_declarative(parsed: ParsedUrl, query: &str, parser: &DeclarativeParser) -> UIResponse {
    match parsed {
        ParsedUrl::Reddit(reddit_path) => {
            let platform = parser.schema.platforms.get("reddit.com").unwrap();
            
            match reddit_path {
                RedditPath::Root => {
                    // Show the root guide if available
                    if let Some(guide) = &platform.root_guide {
                        let ui_guide = UIResponse::guide(
                            query.to_string(),
                            guide.title.clone(),
                            guide.description.clone(),
                            guide.options.clone(),
                        );
                        
                        // Also provide a suggestion
                        let suggestion = UIResponse::suggestions(
                            query.to_string(),
                            Some(Suggestion::new("reddit.com/r/", "Browse subreddits"))
                        );
                        
                        UIResponse::multiple(vec![suggestion, ui_guide])
                    } else {
                        UIResponse::suggestions(
                            query.to_string(),
                            Some(Suggestion::new("reddit.com/r/", "Browse subreddits"))
                        )
                    }
                }
                RedditPath::SubredditRoot => {
                    // Show popular subreddits selection
                    let suggestion = UIResponse::suggestions(
                        query.to_string(),
                        Some(Suggestion::new("reddit.com/r/programming", "Go to r/programming"))
                    );
                    let selection = UIResponse::selection(
                        query.to_string(),
                        "Choose a Subreddit".to_string(),
                        "Select a subreddit to explore, or continue typing to search for a specific one.".to_string(),
                        get_popular_subreddits(),
                    );
                    UIResponse::multiple(vec![suggestion, selection])
                }
                RedditPath::Subreddit(sub) => {
                    UIResponse::suggestions(
                        query.to_string(),
                        Some(Suggestion::new(&format!("reddit.com/r/{}/", sub), "View subreddit"))
                    )
                }
                RedditPath::SubredditWithSlash(sub) => {
                    // Show subreddit browsing options
                    let suggestion_with_random = {
                        let random_id = fetch_random_comment_id(&sub).unwrap_or_else(|| "abc123".to_string());
                        UIResponse::suggestions(
                            query.to_string(),
                            Some(Suggestion::new(&format!("reddit.com/r/{}/comments/{}", sub, random_id), "Random comment!"))
                        )
                    };
                    
                    let guide = UIResponse::guide(
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
                    );
                    
                    UIResponse::multiple(vec![suggestion_with_random, guide])
                }
                RedditPath::Comments(sub, _post_id) => {
                    UIResponse::not_yet_implemented(
                        "Comment Browsing".to_string(),
                        format!("Browsing comments for r/{} is coming soon", sub),
                        None,
                    )
                }
            }
        }
    }
}

fn handle_parse_error_declarative(error: ParseError) -> UIResponse {
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