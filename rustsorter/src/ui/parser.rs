// This module will contain the `nom`-based parser.
// We will build it up piece by piece, following TDD.

use nom::{
    branch::alt,
    bytes::complete::{tag, take_while1},
    combinator::{map, opt},
    sequence::{preceded, tuple},
    IResult,
};

use crate::ui::types::{UIResponse, Suggestion};

// --- Data Structures ---

#[derive(Debug, PartialEq)]
pub enum ParsedUrl {
    Reddit(RedditUrl),
    // Other URL types will go here
}

#[derive(Debug, PartialEq)]
pub struct RedditUrl {
    pub path: RedditPath,
}

#[derive(Debug, PartialEq)]
pub enum RedditPath {
    Root,
    SubredditRoot,
    Subreddit(String),
    SubredditWithSlash(String),
    Comments(String),
}

// --- Parsers ---

fn is_alphanumeric(c: char) -> bool {
    c.is_alphanumeric()
}

fn parse_subreddit(input: &str) -> IResult<&str, String> {
    map(take_while1(is_alphanumeric), |s: &str| s.to_string())(input)
}

fn parse_reddit_path(input: &str) -> IResult<&str, RedditPath> {
    alt((
        map(
            tuple((tag("r/"), parse_subreddit, tag("/comments/"))),
            |(_, sub, _)| RedditPath::Comments(sub),
        ),
        map(
            tuple((tag("r/"), parse_subreddit, tag("/"))),
            |(_, sub, _)| RedditPath::SubredditWithSlash(sub),
        ),
        map(
            tuple((tag("r/"), parse_subreddit)),
            |(_, sub)| RedditPath::Subreddit(sub),
        ),
        map(tag("r/"), |_| RedditPath::SubredditRoot),
        map(tag(""), |_| RedditPath::Root),
    ))(input)
}

fn parse_reddit_url(input: &str) -> IResult<&str, RedditUrl> {
    map(
        preceded(opt(tag("reddit.com/")), parse_reddit_path),
        |path| RedditUrl { path },
    )(input)
}


// --- Public API ---

pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    let query = query.trim();
    if query.is_empty() {
        // We could suggest "r" here if we wanted to be proactive.
        return UIResponse::suggestions(query.to_string(), None);
    }
    
    // Suggest "reddit.com/" for "r" and "re"
    if query == "r" || query == "re" {
        return UIResponse::suggestions(
            query.to_string(),
            Some(Suggestion {
                text: "reddit.com/".to_string(),
                completion: "reddit.com/".to_string(),
                description: Some("Go to Reddit root".to_string()),
                score: 100.0,
            }),
        );
    }

    let result = parse_reddit_url(query);

    let suggestion = match result {
        Ok((remaining, parsed_url)) if remaining.is_empty() => {
            // We have a full, valid parse. Suggest the next logical step.
            get_next_step_suggestion(&parsed_url.path)
        }
        Err(nom::Err::Incomplete(_)) => {
            // The input is a valid *prefix* of a complete parse.
            // This is the ideal case for autocomplete.
            get_incomplete_suggestion(query)
        }
        _ => None, // It's either a failed parse or a partial parse with extra characters
    };

    UIResponse::suggestions(query.to_string(), suggestion)
}

fn get_next_step_suggestion(path: &RedditPath) -> Option<Suggestion> {
    let (completion, description) = match path {
        RedditPath::Root => ("reddit.com/r/".to_string(), "Browse subreddits".to_string()),
        RedditPath::SubredditRoot => ("reddit.com/r/rust".to_string(), "Example subreddit".to_string()),
        RedditPath::Subreddit(sub) => (format!("reddit.com/r/{}/", sub), "Complete subreddit path".to_string()),
        RedditPath::SubredditWithSlash(sub) => (format!("reddit.com/r/{}/comments/", sub), "Browse subreddit posts".to_string()),
        RedditPath::Comments(_) => return None, // No suggestion after comments/
    };

    Some(Suggestion {
        text: completion.clone(),
        completion,
        description: Some(description),
        score: 100.0,
    })
}

fn get_incomplete_suggestion(query: &str) -> Option<Suggestion> {
    // This is a simplified version. A more robust implementation would look at
    // what `nom` needs next. For now, we can use a heuristic.
    if query.ends_with("r/") {
        Some(Suggestion {
            text: "reddit.com/r/rust".to_string(),
            completion: "reddit.com/r/rust".to_string(),
            description: Some("Example subreddit".to_string()),
            score: 100.0,
        })
    } else {
        None
    }
}


pub fn parse_for_search(query: &str) -> UIResponse {
    unimplemented!()
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
    }

    #[test]
    fn test_subreddit_flow() {
        assert_eq!(get_suggestion("reddit.com/"), Some("reddit.com/r/".to_string()));
        assert_eq!(get_suggestion("reddit.com/r/"), Some("reddit.com/r/rust".to_string()));
        assert_eq!(get_suggestion("reddit.com/r/rust"), Some("reddit.com/r/rust/".to_string()));
        assert_eq!(get_suggestion("reddit.com/r/rust/"), Some("reddit.com/r/rust/comments/".to_string()));
    }
}