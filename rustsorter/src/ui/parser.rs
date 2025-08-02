use nom::{
    branch::alt,
    bytes::complete::{tag, take_while1},
    combinator::map,
    sequence::{preceded, tuple},
    IResult,
};

use crate::ui::types::{UIResponse, Suggestion};

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
    if "reddit.com/".starts_with(query) && query != "reddit.com/" {
        return UIResponse::suggestions(query.to_string(), Some(Suggestion::new("reddit.com/", "Go to Reddit")));
    } else if "reddit.com/r/".starts_with(query) && query != "reddit.com/r/" {
        return UIResponse::suggestions(query.to_string(), Some(Suggestion::new("reddit.com/r/", "Browse subreddits")));
    }


    match reddit_url_parser(query) {
        Ok((remaining, parsed_url)) if remaining.is_empty() => {
            let suggestion = get_next_step_suggestion(&parsed_url);
            UIResponse::suggestions(query.to_string(), suggestion)
        }
        _ => {
            UIResponse::suggestions(query.to_string(), None)
        }
    }
}

fn get_next_step_suggestion(url: &ParsedUrl) -> Option<Suggestion> {
    match url {
        ParsedUrl::Reddit(path) => {
            let (completion, description) = match path {
                RedditPath::Root => ("reddit.com/r/".to_string(), "Browse subreddits".to_string()),
                RedditPath::SubredditRoot => ("reddit.com/r/rust".to_string(), "Example subreddit".to_string()),
                RedditPath::Subreddit(sub) => (format!("reddit.com/r/{}/", sub), "View subreddit".to_string()),
                RedditPath::SubredditWithSlash(sub) => (format!("reddit.com/r/{}/comments/", sub), "View comments".to_string()),
                RedditPath::Comments(_) => return None,
            };
            Some(Suggestion::new(&completion, &description))
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
        if let UIResponse::Suggestions(data) = response {
            data.suggestion.map(|s| s.completion)
        } else {
            None
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
}