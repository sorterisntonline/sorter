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
}

#[derive(Debug, PartialEq, Clone)]
pub enum PartialParse {
    Prefix(String),           // "r", "re", "red", etc.
    Domain(String),           // "reddit.c", "reddit.co", etc.
    Path(ParsedUrl, String),  // Complete parse + remaining incomplete part
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
            }
            ParseResult::Partial(PartialParse::Prefix(query.to_string()))
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
        ParsedUrl::Reddit(path) => handle_reddit_path(path, query),
    }
}

fn handle_reddit_path(path: RedditPath, query: &str) -> UIResponse {
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

        // Complete reddit.com/ should return guide
        match parse_for_autocomplete("reddit.com/") {
            UIResponse::Guide(data) => {
                assert_eq!(data.title, "Choose Reddit Content Type");
                assert_eq!(data.options.len(), 2);
                assert_eq!(data.options[0].key, "r");
                assert_eq!(data.options[1].key, "u");
            }
            _ => panic!("Expected Guide for reddit.com/"),
        }

        // reddit.com/r/ should return selection
        match parse_for_autocomplete("reddit.com/r/") {
            UIResponse::Selection(data) => {
                assert_eq!(data.title, "Choose a Subreddit");
                assert!(data.items.len() > 0);
            }
            _ => panic!("Expected Selection for reddit.com/r/"),
        }

        // reddit.com/r/rust should return suggestions
        match parse_for_autocomplete("reddit.com/r/rust") {
            UIResponse::Suggestions(data) => {
                assert_eq!(data.suggestion.as_ref().unwrap().completion, "reddit.com/r/rust/");
            }
            _ => panic!("Expected Suggestions for reddit.com/r/rust"),
        }

        // reddit.com/r/rust/ should return guide
        match parse_for_autocomplete("reddit.com/r/rust/") {
            UIResponse::Guide(data) => {
                assert!(data.title.contains("rust"));
                assert_eq!(data.options.len(), 3);
                assert_eq!(data.options[0].key, "comments");
            }
            _ => panic!("Expected Guide for reddit.com/r/rust/"),
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
            UIResponse::Guide(data) => {
                assert_eq!(data.options[0].completion, "reddit.com/r/");
                assert_eq!(data.options[1].completion, "reddit.com/u/");
            }
            _ => panic!("Expected Guide"),
        }

        // Test subreddit guide
        match parse_for_autocomplete("reddit.com/r/programming/") {
            UIResponse::Guide(data) => {
                assert_eq!(data.options[0].completion, "reddit.com/r/programming/comments/");
                assert_eq!(data.options[1].completion, "reddit.com/r/programming/hot");
                assert_eq!(data.options[2].completion, "reddit.com/r/programming/top");
            }
            _ => panic!("Expected Guide"),
        }
    }
}