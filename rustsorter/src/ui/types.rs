use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
#[serde(tag = "type", content = "data")]
pub enum UIResponse {
    HomePage(HomePageData),
    SearchResults(SearchResultsData),
    VotingPairs(VotingPairsData),
    EntityView(EntityViewData),
    ErrorPage(ErrorPageData),
    NotYetImplemented(NotYetImplementedData),
    Suggestions(SuggestionsData),
    Guide(GuideData),
    Selection(SelectionData),
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct HomePageData {
    pub current_query: Option<String>,
    pub suggested_queries: Vec<String>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct SearchResultsData {
    pub query: String,
    pub results: Vec<SearchResult>,
    pub pagination: PaginationData,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct VotingPairsData {
    pub pair: VotingPair,
    pub progress: VotingProgress,
    pub context: String,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct EntityViewData {
    pub entity: Entity,
    pub children: Vec<Entity>,
    pub rankings: Vec<RankingItem>,
    pub breadcrumbs: Vec<Breadcrumb>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct ErrorPageData {
    pub error_type: String,
    pub message: String,
    pub suggestions: Vec<String>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct NotYetImplementedData {
    pub feature_name: String,
    pub description: String,
    pub issue_url: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct SuggestionsData {
    pub query: String,
    pub suggestion: Option<Suggestion>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct GuideData {
    pub query: String,
    pub title: String,
    pub description: String,
    pub options: Vec<GuideOption>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct SelectionData {
    pub query: String,
    pub title: String,
    pub description: String,
    pub items: Vec<SelectionItem>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct GuideOption {
    pub key: String,
    pub label: String,
    pub description: String,
    pub completion: String,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct SelectionItem {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub completion: String,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Suggestion {
    pub text: String,
    pub completion: String,
    pub description: Option<String>,
    pub score: f64,
}

// Supporting types
#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: Option<String>,
    pub score: Option<f64>,
    pub entity_type: EntityType,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct VotingPair {
    pub item_a: VotingItem,
    pub item_b: VotingItem,
    pub comparison_context: String,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct VotingItem {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub url: Option<String>,
    pub thumbnail: Option<String>,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct VotingProgress {
    pub current_pair: u32,
    pub total_pairs: u32,
    pub completion_percentage: f32,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Entity {
    pub id: String,
    pub title: String,
    pub url: String,
    pub entity_type: EntityType,
    pub metadata: serde_json::Value,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct RankingItem {
    pub rank: u32,
    pub entity: Entity,
    pub score: f64,
    pub vote_count: u32,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct Breadcrumb {
    pub label: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
pub struct PaginationData {
    pub current_page: u32,
    pub total_pages: u32,
    pub page_size: u32,
    pub total_results: u32,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub enum EntityType {
    RedditPost,
    RedditComment,
    RedditSubreddit,
    RedditUser,
    WebPage,
    YouTubeVideo,
    TwitterPost,
    Generic,
}

// Helper functions for creating common UI responses
impl UIResponse {
    pub fn home_page(query: Option<String>) -> Self {
        UIResponse::HomePage(HomePageData {
            current_query: query,
            suggested_queries: vec![
                "reddit.com/r/programming".to_string(),
                "reddit.com/r/askreddit".to_string(),
                "youtube.com/watch?v=...".to_string(),
            ],
        })
    }

    pub fn search_results(query: String, results: Vec<SearchResult>) -> Self {
        UIResponse::SearchResults(SearchResultsData {
            query: query.clone(),
            results,
            pagination: PaginationData {
                current_page: 1,
                total_pages: 1,
                page_size: 25,
                total_results: 0,
            },
        })
    }

    pub fn error(error_type: String, message: String) -> Self {
        UIResponse::ErrorPage(ErrorPageData {
            error_type,
            message,
            suggestions: vec![
                "Try a different URL".to_string(),
                "Check your internet connection".to_string(),
            ],
        })
    }

    pub fn not_yet_implemented(feature_name: String, description: String, issue_url: Option<String>) -> Self {
        UIResponse::NotYetImplemented(NotYetImplementedData {
            feature_name,
            description,
            issue_url,
        })
    }

    pub fn suggestions(query: String, suggestion: Option<Suggestion>) -> Self {
        UIResponse::Suggestions(SuggestionsData {
            query,
            suggestion,
        })
    }

    pub fn guide(query: String, title: String, description: String, options: Vec<GuideOption>) -> Self {
        UIResponse::Guide(GuideData {
            query,
            title,
            description,
            options,
        })
    }

    pub fn selection(query: String, title: String, description: String, items: Vec<SelectionItem>) -> Self {
        UIResponse::Selection(SelectionData {
            query,
            title,
            description,
            items,
        })
    }
}