use crate::ui::types::{UIResponse, Suggestion};
// In the future, we will build a robust parser here using nom.
// For now, this is a placeholder to get the project compiling.

// The parser will follow the following properties:
// r -> reddit.com/
// re -> reddit.com/
// reddit.com/ -> {show infographic explaining that u (sort user posts) and r (sort subreddit posts)} -> reddit.com/r/
// reddit.com/r/ -> reddit.com/r/{randomly chose sub from list}
// reddit.com/r/{sub} -> {show subrdedit view} -> reddit.com/r/{sub}/
// reddit.com/r/{sub}/ -> {show infographic or something} -> reddit.com/r/{sub}/comments/{randomly chose comment from sql}




pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    let query = query.trim();

    if query.is_empty() {
        return UIResponse::suggestions(query.to_string(), None);
    }

    let suggestion = if query == "r" || query == "re" {
        Some(Suggestion {
            text: "reddit.com/".to_string(),
            completion: "reddit.com/".to_string(),
            description: Some("Go to Reddit root".to_string()),
            score: 100.0,
        })
    } else if query == "reddit.com/" {
        Some(Suggestion {
            text: "reddit.com/r/".to_string(),
            completion: "reddit.com/r/".to_string(),
            description: Some("Browse subreddits".to_string()),
            score: 100.0,
        })
    } else if query == "reddit.com/r/" {
        Some(Suggestion {
            text: "reddit.com/r/rust".to_string(),
            completion: "reddit.com/r/rust".to_string(),
            description: Some("Example subreddit".to_string()),
            score: 100.0,
        })
    } else if query.starts_with("reddit.com/r/") && !query.ends_with('/') {
        Some(Suggestion {
            text: format!("{}/", query),
            completion: format!("{}/", query),
            description: Some("Complete subreddit path".to_string()),
            score: 100.0,
        })
    } else if query.starts_with("reddit.com/r/") && query.ends_with('/') && !query.contains("/comments/") {
        Some(Suggestion {
            text: format!("{}comments/", query),
            completion: format!("{}comments/", query),
            description: Some("Browse subreddit posts".to_string()),
            score: 100.0,
        })
    } else {
        None
    };

    UIResponse::suggestions(query.to_string(), suggestion)
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