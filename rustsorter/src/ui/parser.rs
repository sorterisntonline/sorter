// In the future, we will build a robust parser here using nom.
// For now, this is a placeholder to get the project compiling.

// The parser will follow the following properties:
// r -> reddit.com/
// re -> reddit.com/
// reddit.com/ -> {show infographic explaining that u (sort user posts) and r (sort subreddit posts)} -> reddit.com/r/
// reddit.com/r/ -> reddit.com/r/{randomly chose sub from list}
// reddit.com/r/{sub} -> {show subrdedit view} -> reddit.com/r/{sub}/
// reddit.com/r/{sub}/ -> {show infographic or something} -> reddit.com/r/{sub}/comments/{randomly chose comment from sql}



use crate::ui::types::{UIResponse, Suggestion};

pub fn parse_for_autocomplete(query: &str) -> UIResponse {
    // Placeholder logic
    let suggestion = if "reddit.com/r/".starts_with(query) {
        Some(Suggestion {
            text: "reddit.com/r/".to_string(),
            completion: "reddit.com/r/".to_string(),
            description: Some("Browse a subreddit".to_string()),
            score: 100.0,
        })
    } else {
        None
    };

    UIResponse::suggestions(query.to_string(), suggestion)
}

pub fn parse_for_search(query: &str) -> UIResponse {
    // Placeholder logic
    if query.contains("reddit.com") {
        let results = vec![
            crate::ui::types::SearchResult {
                title: "Reddit URL".to_string(),
                url: query.to_string(),
                snippet: Some("Reddit integration is a work in progress.".to_string()),
                score: Some(90.0),
                entity_type: crate::ui::types::EntityType::RedditSubreddit,
            },
        ];
        UIResponse::search_results(query.to_string(), results)
    } else {
        UIResponse::not_yet_implemented(
            "URL Parsing".to_string(),
            format!("Parsing for '{}' is not yet supported.", query),
            None,
        )
    }
}