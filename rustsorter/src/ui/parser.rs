use nom::{
    branch::alt,
    bytes::complete::{tag, take_while1},
    combinator::{map, eof},
    sequence::{preceded, tuple, terminated},
    IResult,
};

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

// --- Parser Implementation ---

fn is_subreddit_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn subreddit_parser(input: &str) -> IResult<&str, String> {
    map(take_while1(is_subreddit_char), |s: &str| s.to_string())(input)
}

fn reddit_path_parser(input: &str) -> IResult<&str, RedditPath> {
    alt((
        // Most specific patterns first
        map(
            tuple((tag("r/"), subreddit_parser, tag("/comments/"))),
            |(_, sub, _)| RedditPath::Comments(sub, None),
        ),
        map(
            tuple((tag("r/"), subreddit_parser, tag("/"))),
            |(_, sub, _)| RedditPath::SubredditWithSlash(sub),
        ),
        map(
            preceded(tag("r/"), terminated(subreddit_parser, eof)),
            RedditPath::Subreddit,
        ),
        map(terminated(tag("r/"), eof), |_| RedditPath::SubredditRoot),
        map(eof, |_| RedditPath::Root),
    ))(input)
}

fn reddit_url_parser(input: &str) -> IResult<&str, ParsedUrl> {
    map(
        preceded(tag("reddit.com/"), reddit_path_parser),
        ParsedUrl::Reddit,
    )(input)
}

// --- Main parsing function ---

pub fn parse_url(query: &str) -> ParseResult {
    let query = query.trim();
    
    // Handle empty input
    if query.is_empty() {
        return ParseResult::Partial(PartialParse::Prefix("".to_string()));
    }
    
    // Check for unsupported platforms first
    if let Some(error) = check_unsupported_platforms(query) {
        return ParseResult::Error(error);
    }
    
    // Check if it's an incomplete domain first (more specific)
    if is_incomplete_domain(query, "reddit.com") {
        return ParseResult::Partial(PartialParse::Domain(query.to_string()));
    }
    
    // Then check if it's a Reddit URL prefix (less specific)
    if let Some(prefix) = is_reddit_prefix(query) {
        return ParseResult::Partial(PartialParse::Prefix(prefix));
    }
    
    // Try to parse as complete URL
    match reddit_url_parser(query) {
        Ok(("", parsed)) => ParseResult::Complete(parsed),
        Ok((remaining, parsed)) => {
            // Partial path after valid parse
            ParseResult::Partial(PartialParse::Path(parsed, remaining.to_string()))
        }
        Err(_) => {
            // Check if it starts with a valid domain but has incomplete path
            if query.starts_with("reddit.com/") {
                let path_part = &query["reddit.com/".len()..];
                if path_part.starts_with("r") && !path_part.starts_with("r/") {
                    return ParseResult::Partial(PartialParse::Path(
                        ParsedUrl::Reddit(RedditPath::Root),
                        path_part.to_string(),
                    ));
                }
                // Invalid path after reddit.com/
                return ParseResult::Error(ParseError::MalformedUrl(
                    format!("Invalid Reddit path: '{}'", path_part)
                ));
            }
            
            // Check if it looks like a URL but isn't supported
            if is_url_like(query) {
                ParseResult::Error(ParseError::InvalidFormat(
                    format!("Unable to parse URL: '{}'", query)
                ))
            } else {
                // Treat as unknown prefix for now
                ParseResult::Partial(PartialParse::Prefix(query.to_string()))
            }
        }
    }
}

fn is_reddit_prefix(input: &str) -> Option<String> {
    // Only match if it's a prefix without a dot
    if input.contains('.') {
        return None;
    }
    
    let reddit_prefixes = ["r", "re", "red", "redd", "reddi", "reddit"];
    reddit_prefixes.iter()
        .find(|&&prefix| prefix == input.to_lowercase())
        .map(|_| input.to_string())
}

fn is_incomplete_domain(input: &str, target: &str) -> bool {
    // Consider it a domain if:
    // 1. It's a prefix of the target domain OR equals the target domain (without slash)
    // 2. It doesn't end with a slash
    // 3. It contains a dot or starts with "reddit."
    !input.is_empty() && 
    (target.starts_with(input) || input == target) && 
    !input.ends_with('/') &&
    (input.contains('.') || input.starts_with("reddit."))
}

fn check_unsupported_platforms(input: &str) -> Option<ParseError> {
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
        if input.starts_with(platform) || input.starts_with(&format!("www.{}", platform)) {
            return Some(ParseError::UnsupportedPlatform(
                format!("Platform '{}' is not yet supported. Currently only Reddit URLs are supported.", platform)
            ));
        }
    }
    
    None
}

fn is_url_like(input: &str) -> bool {
    // Check if it looks like a URL (contains domain-like patterns)
    input.contains('.') && 
    (input.contains('/') || input.contains('?') || input.contains('#') ||
     input.starts_with("http://") || input.starts_with("https://") ||
     input.starts_with("www."))
}

// --- Public API ---

pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    let parse_result = parse_url(query);
    parse_result_to_ui_response(parse_result, query)
}

// --- Conversion from ParseResult to UIResponse ---

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
        ParsedUrl::Reddit(path) => handle_reddit_path_with_suggestion(path, query),
    }
}

fn handle_reddit_path_with_suggestion(path: RedditPath, query: &str) -> UIResponse {
    let main_response = handle_reddit_path_single(path.clone(), query);
    
    // Check if we should also provide a suggestion for the next step
    let suggestion = match &path {
        RedditPath::Root => {
            Some(UIResponse::suggestions(
                query.to_string(),
                Some(Suggestion::new("reddit.com/r/", "Browse subreddits"))
            ))
        }
        RedditPath::SubredditRoot => {
            // When showing subreddit selection, suggest a popular subreddit
            Some(UIResponse::suggestions(
                query.to_string(),
                Some(Suggestion::new("reddit.com/r/programming", "Go to r/programming"))
            ))
        }
        RedditPath::Subreddit(sub) => {
            Some(UIResponse::suggestions(
                query.to_string(),
                Some(Suggestion::new(&format!("reddit.com/r/{}/", sub), "View subreddit"))
            ))
        }
        RedditPath::SubredditWithSlash(sub) => {
            // When viewing a subreddit, suggest going to comments
            Some(UIResponse::suggestions(
                query.to_string(),
                Some(Suggestion::new(&format!("reddit.com/r/{}/comments/", sub), "Browse comments"))
            ))
        }
        _ => None,
    };
    
    if let Some(suggestion_response) = suggestion {
        UIResponse::multiple(vec![suggestion_response, main_response])
    } else {
        main_response
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

fn handle_reddit_path_single(path: RedditPath, query: &str) -> UIResponse {
    match path {
        RedditPath::Root => {
            UIResponse::guide(
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
            )
        }
        RedditPath::SubredditRoot => {
            UIResponse::selection(
                query.to_string(),
                "Choose a Subreddit".to_string(),
                "Select a subreddit to explore, or continue typing to search for a specific one.".to_string(),
                get_popular_subreddits(),
            )
        }
        RedditPath::Subreddit(sub) => {
            UIResponse::suggestions(
                query.to_string(),
                Some(Suggestion::new(&format!("reddit.com/r/{}/", sub), "View subreddit"))
            )
        }
        RedditPath::SubredditWithSlash(sub) => {
            UIResponse::guide(
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
            )
        }
        RedditPath::Comments(sub, _) => {
            UIResponse::not_yet_implemented(
                "Comment Browsing".to_string(),
                format!("Browsing comments for r/{} is coming soon", sub),
                None,
            )
        }
    }
}

fn get_popular_subreddits() -> Vec<SelectionItem> {
    vec![
        SelectionItem {
            id: "rust".to_string(),
            title: "r/rust".to_string(),
            description: Some("Systems programming language focused on safety and performance".to_string()),
            completion: "reddit.com/r/rust".to_string(),
        },
        SelectionItem {
            id: "programming".to_string(),
            title: "r/programming".to_string(),
            description: Some("General programming discussions and news".to_string()),
            completion: "reddit.com/r/programming".to_string(),
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

        // reddit.com/r/rust should return Multiple with suggestion
        match parse_for_autocomplete("reddit.com/r/rust") {
            UIResponse::Multiple(data) => {
                assert_eq!(data.responses.len(), 2);
                // First should be suggestion for completion
                match &data.responses[0] {
                    UIResponse::Suggestions(sug_data) => {
                        assert_eq!(sug_data.suggestion.as_ref().unwrap().completion, "reddit.com/r/rust/");
                    }
                    _ => panic!("Expected first response to be Suggestions"),
                }
            }
            _ => panic!("Expected Multiple for reddit.com/r/rust"),
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