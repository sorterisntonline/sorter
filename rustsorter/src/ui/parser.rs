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

fn parse_url(url: &str) -> ParseResult {
    return ParseResult::Partial(PartialParse::Prefix("r".to_string()));
}

// --- Declarative Parser Implementation ---

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