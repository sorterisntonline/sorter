pub mod api_key;
pub mod app_state;
pub mod auth_middleware;
pub mod entity;
pub mod entity_relationships;
pub mod extractors;
//pub mod folksonomy; // Complex version - WIP
pub mod folksonomy_simple; // Simplified working version
pub mod models;
pub mod pagerank;
pub mod pair;
pub mod vote;

//#[cfg(test)]
//mod folksonomy_test; // Complex test - disabled

#[cfg(test)]
mod folksonomy_simple_test;

pub use pagerank::{EntityIdentifier, RankedEntity, RankingResponse, RelevantVote, rank_entities};
