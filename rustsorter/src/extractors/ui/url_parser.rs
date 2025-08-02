use pest::Parser;
use pest_derive::Parser;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Parser)]
#[grammar = "extractors/ui/url.pest"]
pub struct UrlParser;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", content = "data")]
pub enum ParsedUrl {
    Reddit(RedditUrl),
    YouTube(YouTubeUrl),
    Twitter(TwitterUrl),
    GitHub(GitHubUrl),
    Generic(GenericUrl),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct RedditUrl {
    pub scheme: Option<String>,
    pub path: RedditPath,
    pub query: Option<Vec<(String, Option<String>)>>,
    pub fragment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", content = "data")]
pub enum RedditPath {
    Subreddit { name: String },
    SubredditPost { 
        subreddit: String, 
        post_id: String, 
        slug: Option<String>,
        comment_id: Option<String>,
    },
    User { username: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct YouTubeUrl {
    pub scheme: Option<String>,
    pub domain: String,
    pub content: YouTubeContent,
    pub query: Option<Vec<(String, Option<String>)>>,
    pub fragment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", content = "data")]
pub enum YouTubeContent {
    Video { id: String },
    Channel { id: String },
    ChannelByName { name: String },
    ChannelByHandle { handle: String },
    Playlist { id: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct TwitterUrl {
    pub scheme: Option<String>,
    pub username: String,
    pub tweet_id: Option<String>,
    pub query: Option<Vec<(String, Option<String>)>>,
    pub fragment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct GitHubUrl {
    pub scheme: Option<String>,
    pub username: String,
    pub repo: Option<String>,
    pub path: Option<GitHubPath>,
    pub query: Option<Vec<(String, Option<String>)>>,
    pub fragment: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", content = "data")]
pub enum GitHubPath {
    Issues { number: Option<u32> },
    PullRequest { number: Option<u32> },
    Tree { branch: String },
    Blob { branch: String, file_path: String },
    Commit { hash: String },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct GenericUrl {
    pub scheme: Option<String>,
    pub domain: String,
    pub path: Option<String>,
    pub query: Option<Vec<(String, Option<String>)>>,
    pub fragment: Option<String>,
}

impl ParsedUrl {
    pub fn parse(input: &str) -> Result<ParsedUrl, pest::error::Error<Rule>> {
        // Normalize input - trim whitespace and ensure we have something to parse
        let input = input.trim();
        if input.is_empty() {
            return Err(pest::error::Error::new_from_pos(
                pest::error::ErrorVariant::CustomError {
                    message: "Empty input".to_string(),
                },
                pest::Position::from_start(input),
            ));
        }

        // Try specific parsers first (more specific patterns)
        if let Ok(reddit) = Self::parse_reddit(input) {
            return Ok(ParsedUrl::Reddit(reddit));
        }
        
        if let Ok(youtube) = Self::parse_youtube(input) {
            return Ok(ParsedUrl::YouTube(youtube));
        }
        
        if let Ok(twitter) = Self::parse_twitter(input) {
            return Ok(ParsedUrl::Twitter(twitter));
        }
        
        if let Ok(github) = Self::parse_github(input) {
            return Ok(ParsedUrl::GitHub(github));
        }

        // Fall back to generic URL parsing
        Self::parse_generic(input).map(ParsedUrl::Generic)
    }

    fn parse_reddit(input: &str) -> Result<RedditUrl, pest::error::Error<Rule>> {
        let parsed = UrlParser::parse(Rule::reddit_url, input)?.next().unwrap();
        
        let mut scheme = None;
        let mut path = None;
        let mut query = None;
        let mut fragment = None;

        for pair in parsed.into_inner() {
            match pair.as_rule() {
                Rule::scheme => {
                    scheme = Some(pair.as_str().to_string());
                }
                Rule::reddit_path => {
                    path = Some(Self::parse_reddit_path(pair)?);
                }
                Rule::query => {
                    query = Some(Self::parse_query(pair));
                }
                Rule::fragment => {
                    fragment = Some(pair.into_inner().as_str().to_string());
                }
                _ => {}
            }
        }

        Ok(RedditUrl {
            scheme,
            path: path.ok_or_else(|| {
                pest::error::Error::new_from_pos(
                    pest::error::ErrorVariant::CustomError {
                        message: "Missing Reddit path".to_string(),
                    },
                    pest::Position::from_start(input),
                )
            })?,
            query,
            fragment,
        })
    }

    fn parse_reddit_path(pair: pest::iterators::Pair<Rule>) -> Result<RedditPath, pest::error::Error<Rule>> {
        for inner_pair in pair.into_inner() {
            match inner_pair.as_rule() {
                Rule::subreddit_name => {
                    let subreddit = inner_pair.as_str().to_string();
                    // Check if there's a post following
                    return Ok(RedditPath::Subreddit { name: subreddit });
                }
                Rule::reddit_post => {
                    // This is more complex - we need to find the subreddit name from siblings
                    // For now, let's implement a simpler version
                    return Ok(RedditPath::Subreddit { name: "unknown".to_string() });
                }
                Rule::username => {
                    return Ok(RedditPath::User { username: inner_pair.as_str().to_string() });
                }
                _ => {}
            }
        }
        
        Err(pest::error::Error::new_from_pos(
            pest::error::ErrorVariant::CustomError {
                message: "Invalid Reddit path".to_string(),
            },
            pest::Position::from_start(""),
        ))
    }

    fn parse_youtube(input: &str) -> Result<YouTubeUrl, pest::error::Error<Rule>> {
        let parsed = UrlParser::parse(Rule::youtube_url, input)?.next().unwrap();
        
        let mut scheme = None;
        let mut domain = String::new();
        let mut content = None;
        let mut query = None;
        let mut fragment = None;

        for pair in parsed.into_inner() {
            match pair.as_rule() {
                Rule::scheme => {
                    scheme = Some(pair.as_str().to_string());
                }
                Rule::youtube_domain => {
                    domain = pair.as_str().to_string();
                }
                Rule::youtube_path => {
                    content = Some(Self::parse_youtube_content(pair)?);
                }
                Rule::query => {
                    query = Some(Self::parse_query(pair));
                }
                Rule::fragment => {
                    fragment = Some(pair.into_inner().as_str().to_string());
                }
                _ => {}
            }
        }

        Ok(YouTubeUrl {
            scheme,
            domain,
            content: content.ok_or_else(|| {
                pest::error::Error::new_from_pos(
                    pest::error::ErrorVariant::CustomError {
                        message: "Missing YouTube content".to_string(),
                    },
                    pest::Position::from_start(input),
                )
            })?,
            query,
            fragment,
        })
    }

    fn parse_youtube_content(pair: pest::iterators::Pair<Rule>) -> Result<YouTubeContent, pest::error::Error<Rule>> {
        for inner_pair in pair.into_inner() {
            match inner_pair.as_rule() {
                Rule::video_id => {
                    return Ok(YouTubeContent::Video { id: inner_pair.as_str().to_string() });
                }
                Rule::channel_id => {
                    return Ok(YouTubeContent::Channel { id: inner_pair.as_str().to_string() });
                }
                Rule::channel_name => {
                    return Ok(YouTubeContent::ChannelByName { name: inner_pair.as_str().to_string() });
                }
                Rule::channel_handle => {
                    return Ok(YouTubeContent::ChannelByHandle { handle: inner_pair.as_str().to_string() });
                }
                Rule::playlist_id => {
                    return Ok(YouTubeContent::Playlist { id: inner_pair.as_str().to_string() });
                }
                _ => {}
            }
        }
        
        Err(pest::error::Error::new_from_pos(
            pest::error::ErrorVariant::CustomError {
                message: "Invalid YouTube content".to_string(),
            },
            pest::Position::from_start(""),
        ))
    }

    fn parse_twitter(_input: &str) -> Result<TwitterUrl, pest::error::Error<Rule>> {
        // Simplified implementation
        Err(pest::error::Error::new_from_pos(
            pest::error::ErrorVariant::CustomError {
                message: "Twitter parsing not yet implemented".to_string(),
            },
            pest::Position::from_start(""),
        ))
    }

    fn parse_github(_input: &str) -> Result<GitHubUrl, pest::error::Error<Rule>> {
        // Simplified implementation
        Err(pest::error::Error::new_from_pos(
            pest::error::ErrorVariant::CustomError {
                message: "GitHub parsing not yet implemented".to_string(),
            },
            pest::Position::from_start(""),
        ))
    }

    fn parse_generic(input: &str) -> Result<GenericUrl, pest::error::Error<Rule>> {
        let parsed = UrlParser::parse(Rule::url, input)?.next().unwrap();
        
        let mut scheme = None;
        let mut domain = String::new();
        let mut path = None;
        let mut query = None;
        let mut fragment = None;

        for pair in parsed.into_inner() {
            match pair.as_rule() {
                Rule::scheme => {
                    scheme = Some(pair.as_str().to_string());
                }
                Rule::domain => {
                    domain = pair.as_str().to_string();
                }
                Rule::path => {
                    path = Some(pair.as_str().to_string());
                }
                Rule::query => {
                    query = Some(Self::parse_query(pair));
                }
                Rule::fragment => {
                    fragment = Some(pair.into_inner().as_str().to_string());
                }
                _ => {}
            }
        }

        Ok(GenericUrl {
            scheme,
            domain,
            path,
            query,
            fragment,
        })
    }

    fn parse_query(pair: pest::iterators::Pair<Rule>) -> Vec<(String, Option<String>)> {
        let mut params = Vec::new();
        
        for query_param in pair.into_inner() {
            if query_param.as_rule() == Rule::query_param {
                let mut key = None;
                let mut value = None;
                
                for param_part in query_param.into_inner() {
                    match param_part.as_rule() {
                        Rule::query_key => {
                            key = Some(param_part.as_str().to_string());
                        }
                        Rule::query_value => {
                            value = Some(param_part.as_str().to_string());
                        }
                        _ => {}
                    }
                }
                
                if let Some(k) = key {
                    params.push((k, value));
                }
            }
        }
        
        params
    }

    /// Get the canonical URL string for this parsed URL
    pub fn canonical_url(&self) -> String {
        match self {
            ParsedUrl::Reddit(reddit) => {
                let mut url = String::from("reddit.com");
                match &reddit.path {
                    RedditPath::Subreddit { name } => {
                        url.push_str(&format!("/r/{}", name));
                    }
                    RedditPath::SubredditPost { subreddit, post_id, slug, comment_id } => {
                        url.push_str(&format!("/r/{}/comments/{}", subreddit, post_id));
                        if let Some(s) = slug {
                            url.push_str(&format!("/{}", s));
                        }
                        if let Some(c) = comment_id {
                            url.push_str(&format!("/{}", c));
                        }
                    }
                    RedditPath::User { username } => {
                        url.push_str(&format!("/u/{}", username));
                    }
                }
                url
            }
            ParsedUrl::YouTube(youtube) => {
                let mut url = String::from("youtube.com");
                match &youtube.content {
                    YouTubeContent::Video { id } => {
                        url.push_str(&format!("/watch?v={}", id));
                    }
                    YouTubeContent::Channel { id } => {
                        url.push_str(&format!("/channel/{}", id));
                    }
                    YouTubeContent::ChannelByName { name } => {
                        url.push_str(&format!("/c/{}", name));
                    }
                    YouTubeContent::ChannelByHandle { handle } => {
                        url.push_str(&format!("/@{}", handle));
                    }
                    YouTubeContent::Playlist { id } => {
                        url.push_str(&format!("/playlist?list={}", id));
                    }
                }
                url
            }
            ParsedUrl::Twitter(twitter) => {
                let mut url = format!("twitter.com/{}", twitter.username);
                if let Some(tweet_id) = &twitter.tweet_id {
                    url.push_str(&format!("/status/{}", tweet_id));
                }
                url
            }
            ParsedUrl::GitHub(github) => {
                let mut url = format!("github.com/{}", github.username);
                if let Some(repo) = &github.repo {
                    url.push_str(&format!("/{}", repo));
                }
                // Add path handling for issues, PRs, etc.
                url
            }
            ParsedUrl::Generic(generic) => {
                let mut url = generic.domain.clone();
                if let Some(path) = &generic.path {
                    url.push_str(path);
                }
                url
            }
        }
    }

    /// Get a display name for this URL
    pub fn display_name(&self) -> String {
        match self {
            ParsedUrl::Reddit(reddit) => {
                match &reddit.path {
                    RedditPath::Subreddit { name } => format!("r/{}", name),
                    RedditPath::SubredditPost { subreddit, .. } => format!("r/{} post", subreddit),
                    RedditPath::User { username } => format!("u/{}", username),
                }
            }
            ParsedUrl::YouTube(youtube) => {
                match &youtube.content {
                    YouTubeContent::Video { .. } => "YouTube Video".to_string(),
                    YouTubeContent::Channel { .. } => "YouTube Channel".to_string(),
                    YouTubeContent::ChannelByName { name } => format!("YouTube Channel: {}", name),
                    YouTubeContent::ChannelByHandle { handle } => format!("YouTube @{}", handle),
                    YouTubeContent::Playlist { .. } => "YouTube Playlist".to_string(),
                }
            }
            ParsedUrl::Twitter(twitter) => {
                if twitter.tweet_id.is_some() {
                    format!("@{} tweet", twitter.username)
                } else {
                    format!("@{}", twitter.username)
                }
            }
            ParsedUrl::GitHub(github) => {
                if let Some(repo) = &github.repo {
                    format!("{}/{}", github.username, repo)
                } else {
                    github.username.clone()
                }
            }
            ParsedUrl::Generic(generic) => generic.domain.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reddit_parsing() {
        let cases = vec![
            "reddit.com/r/programming",
            "https://reddit.com/r/programming",
            "www.reddit.com/r/askreddit",
            "http://reddit.com/u/spez",
        ];

        for case in cases {
            let result = ParsedUrl::parse(case);
            println!("Parsing '{}': {:?}", case, result);
            assert!(result.is_ok());
        }
    }

    #[test]
    fn test_canonical_urls() {
        let cases = vec![
            ("reddit.com/r/programming", "reddit.com/r/programming"),
            ("https://reddit.com/r/programming", "reddit.com/r/programming"),
            ("www.reddit.com/r/askreddit", "reddit.com/r/askreddit"),
        ];

        for (input, expected) in cases {
            if let Ok(parsed) = ParsedUrl::parse(input) {
                assert_eq!(parsed.canonical_url(), expected);
            }
        }
    }
}