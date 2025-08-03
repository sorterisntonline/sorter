use nom::{
    branch::alt,
    bytes::complete::{tag, take_while1},
    combinator::map,
    sequence::{preceded, tuple},
    IResult,
};

use crate::ui::types::{UIResponse, Suggestion, GuideOption, SelectionItem};

// --- Data Structures ---

#[derive(Debug, PartialEq)]
pub enum ParsedUrl {
    Reddit(RedditPath),
    // In the future: YouTube, GitHub, etc.
}

#[derive(Debug, PartialEq)]
pub enum RedditPath {
    Root,
    SubredditRoot,
    Subreddit(String),
    SubredditWithSlash(String),
    Comments(String),
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
        map(
            tuple((tag("r/"), subreddit_parser, tag("/comments/"))),
            |(_, sub, _)| RedditPath::Comments(sub),
        ),
        map(
            tuple((tag("r/"), subreddit_parser, tag("/"))),
            |(_, sub, _)| RedditPath::SubredditWithSlash(sub),
        ),
        map(
            tuple((tag("r/"), subreddit_parser)),
            |(_, sub)| RedditPath::Subreddit(sub),
        ),
        map(tag("r/"), |_| RedditPath::SubredditRoot),
        map(tag(""), |_| RedditPath::Root), // Base case: matches an empty path
    ))(input)
}

fn reddit_url_parser(input: &str) -> IResult<&str, ParsedUrl> {
    map(
        preceded(tag("reddit.com/"), reddit_path_parser),
        ParsedUrl::Reddit,
    )(input)
}

// --- Public API ---

pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    let query = query.trim();

    // Handle initial shortcuts that aren't full URLs yet
    if query.eq_ignore_ascii_case("r") || query.eq_ignore_ascii_case("re") {
        return UIResponse::suggestions(query.to_string(), Some(Suggestion::new("reddit.com/", "Go to Reddit")));
    }
    
    // Handle incomplete cases that nom struggles with by default
    // Check for incomplete reddit.com/r/ first (more specific)
    if "reddit.com/r/".starts_with(query) && query != "reddit.com/r/" && query.starts_with("reddit.com/r") {
        return UIResponse::suggestions(query.to_string(), Some(Suggestion::new("reddit.com/r/", "Browse subreddits")));
    }
    // Then check for incomplete reddit.com/ (less specific)
    else if "reddit.com/".starts_with(query) && query != "reddit.com/" {
        return UIResponse::suggestions(query.to_string(), Some(Suggestion::new("reddit.com/", "Go to Reddit")));
    }

    match reddit_url_parser(query) {
        Ok((remaining, parsed_url)) if remaining.is_empty() => {
            get_next_step_response(&parsed_url, query)
        }
        _ => {
            UIResponse::suggestions(query.to_string(), None)
        }
    }
}

fn get_next_step_response(url: &ParsedUrl, query: &str) -> UIResponse {
    match url {
        ParsedUrl::Reddit(path) => {
            match path {
                RedditPath::Root => {
                    // Show guide explaining u vs r options
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
                    // Show selection of popular subreddits
                    UIResponse::selection(
                        query.to_string(),
                        "Choose a Subreddit".to_string(),
                        "Select a subreddit to explore, or continue typing to search for a specific one.".to_string(),
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
                        ],
                    )
                }
                RedditPath::Subreddit(sub) => {
                    UIResponse::suggestions(
                        query.to_string(),
                        Some(Suggestion::new(&format!("reddit.com/r/{}/", sub), "View subreddit"))
                    )
                }
                RedditPath::SubredditWithSlash(sub) => {
                    // Show guide for subreddit options
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
                RedditPath::Comments(_) => {
                    UIResponse::suggestions(query.to_string(), None)
                }
            }
        }
    }
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

    fn get_suggestion(query: &str) -> Option<String> {
        let response = parse_for_autocomplete(query);
        match response {
            UIResponse::Suggestions(data) => data.suggestion.map(|s| s.completion),
            UIResponse::Guide(data) => {
                // For guide responses, return the first option's completion
                data.options.first().map(|opt| opt.completion.clone())
            },
            UIResponse::Selection(data) => {
                // For selection responses, return the first item's completion
                data.items.first().map(|item| item.completion.clone())
            },
            _ => None,
        }
    }

    #[test]
    fn test_initial_prompts() {
        assert_eq!(get_suggestion("r"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("re"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("red"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("redd"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("reddi"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("reddit"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("reddit."), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("reddit.c"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("reddit.co"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("reddit.com"), Some("reddit.com/".to_string()));
        assert_eq!(get_suggestion("reddit.com/"), Some("reddit.com/r/".to_string()));
        assert_eq!(get_suggestion("reddit.com/r/"), Some("reddit.com/r/rust".to_string()));
        assert_eq!(get_suggestion("reddit.com/r/rust"), Some("reddit.com/r/rust/".to_string()));
    }

    #[test]
    fn test_subreddit_flow() {
        assert_eq!(get_suggestion("reddit.com/"), Some("reddit.com/r/".to_string()));
        assert_eq!(get_suggestion("reddit.com/r/"), Some("reddit.com/r/rust".to_string()));
        assert_eq!(get_suggestion("reddit.com/r/rust"), Some("reddit.com/r/rust/".to_string()));
        assert_eq!(get_suggestion("reddit.com/r/rust/"), Some("reddit.com/r/rust/comments/".to_string()));
    }

    #[test]
    fn test_ui_response_types() {
        // Test that we get the right UI response types
        let response1 = parse_for_autocomplete("reddit.com/");
        let response2 = parse_for_autocomplete("reddit.com/r/");
        let response3 = parse_for_autocomplete("reddit.com/r/rust");
        let response4 = parse_for_autocomplete("reddit.com/r/rust/");
        
        // Verify types
        match response1 {
            UIResponse::Guide(_) => {},
            _ => panic!("Expected Guide for reddit.com/"),
        }
        
        match response2 {
            UIResponse::Selection(_) => {},
            _ => panic!("Expected Selection for reddit.com/r/"),
        }
        
        match response3 {
            UIResponse::Suggestions(_) => {},
            _ => panic!("Expected Suggestions for reddit.com/r/rust"),
        }
        
        match response4 {
            UIResponse::Guide(_) => {},
            _ => panic!("Expected Guide for reddit.com/r/rust/"),
        }
    }
}