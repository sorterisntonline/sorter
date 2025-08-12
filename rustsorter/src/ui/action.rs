use std::collections::HashMap;
use crate::ui::types::{GuideOption, SelectionItem, Suggestion, SuggestionsData, ScrollingSuggestion, ErrorPageData, NotYetImplementedData};

/// Represents the result of parsing a query - an action to be executed
/// This enum describes WHAT should be done, without containing the actual data
#[derive(Debug, Clone)]
pub enum UIAction {
    // --- Static actions that need no database ---
    ShowStaticGuide {
        query: String,
        title: String,
        description: String,
        options: Vec<GuideOption>,
    },
    
    ShowStaticSelection {
        query: String,
        title: String,
        description: String,
        items: Vec<SelectionItem>,
    },
    
    ShowSuggestions(SuggestionsData),
    
    ShowScrollingSuggestions {
        query: String,
        suggestions: Vec<ScrollingSuggestion>,
        animation_interval_ms: u32,
        loop_through: bool,
    },
    
    ShowError(ErrorPageData),
    
    ShowNotYetImplemented(NotYetImplementedData),
    
    ShowHomePage {
        query: Option<String>,
    },
    
    ShowMultiple {
        actions: Vec<UIAction>,
    },
    
    // --- Dynamic actions that need database/state ---
    
    ImportRedditContent {
        url: String,
        entity_type: String, // "subreddit", "post", "user"
        context: HashMap<String, String>,
    },
    
    // Generic entity view (for when we have a ns and pk)
    RenderEntityView {
        ns: String,
        pk: String,
    },
    
    // Suggest subreddits from database
    SuggestSubredditsFromDb {
        partial: String,
        prefix: String,
    },
    
    // Search entities in database
    SearchEntities {
        query: String,
        entity_type: Option<String>,
    },
    
    // Unified subreddit resolution: try exact match, then suggestions, then import
    ResolveAndDisplaySubreddit {
        subreddit: String,
        prefix: String, // The part of the URL before the subreddit name
    },
}

impl UIAction {
    /// Helper to create a suggestion action
    pub fn suggest(query: String, suggestion: Option<Suggestion>) -> Self {
        UIAction::ShowSuggestions(SuggestionsData {
            query,
            suggestion,
        })
    }
    
    /// Helper to create an error action
    pub fn error(error_type: String, message: String) -> Self {
        UIAction::ShowError(ErrorPageData {
            error_type,
            message,
            suggestions: vec![],
        })
    }
    
    /// Helper to create a static guide action
    pub fn guide(query: String, title: String, description: String, options: Vec<GuideOption>) -> Self {
        UIAction::ShowStaticGuide {
            query,
            title,
            description,
            options,
        }
    }
    
    /// Helper to create a static selection action
    pub fn selection(query: String, title: String, description: String, items: Vec<SelectionItem>) -> Self {
        UIAction::ShowStaticSelection {
            query,
            title,
            description,
            items,
        }
    }
    
    /// Helper to create a multiple actions response
    pub fn multiple(actions: Vec<UIAction>) -> Self {
        UIAction::ShowMultiple { actions }
    }
    
    /// Helper to create a scrolling suggestions action
    pub fn scrolling_suggestions(query: String, suggestions: Vec<ScrollingSuggestion>, animation_interval_ms: u32, loop_through: bool) -> Self {
        UIAction::ShowScrollingSuggestions {
            query,
            suggestions,
            animation_interval_ms,
            loop_through,
        }
    }
}
