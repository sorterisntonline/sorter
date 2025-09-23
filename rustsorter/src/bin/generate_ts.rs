use ts_rs::TS;

fn main() {
    // Export all types annotated with ts-rs
    rustsorter::entity::Entity::export_all().unwrap();
    rustsorter::entity::EntityPayload::export_all().unwrap();
    rustsorter::entity::EntityQueryParams::export_all().unwrap();
    rustsorter::entity::EntityCreateQueryParams::export_all().unwrap();
    rustsorter::entity::EntityWithParentsAndChildren::export_all().unwrap();
    rustsorter::entity::EntityPath::export_all().unwrap();

    rustsorter::vote::Vote::export_all().unwrap();
    rustsorter::vote::VotePath::export_all().unwrap();
    rustsorter::vote::VotePayload::export_all().unwrap();

    rustsorter::models::User::export_all().unwrap();
    rustsorter::models::TempSessionData::export_all().unwrap();

    rustsorter::auth::endpoints::SessionStatusResponse::export_all().unwrap();
    rustsorter::auth::endpoints::CompleteSignupRequest::export_all().unwrap();
    rustsorter::auth::endpoints::CompleteSignupResponse::export_all().unwrap();
    rustsorter::auth::endpoints::LogoutResponse::export_all().unwrap();
    rustsorter::auth::endpoints::HandleAvailabilityResponse::export_all().unwrap();
    rustsorter::auth::endpoints::ImportRecentSongsResponse::export_all().unwrap();
    rustsorter::auth::endpoints::SpotifySong::export_all().unwrap();

    rustsorter::pair::PairQueryParams::export_all().unwrap();
    rustsorter::pair::PairResponse::export_all().unwrap();

    rustsorter::pagerank::EntityIdentifier::export_all().unwrap();
    rustsorter::pagerank::RankedEntity::export_all().unwrap();
    rustsorter::pagerank::RankingResponse::export_all().unwrap();
    rustsorter::pagerank::RankingSnapshot::export_all().unwrap();
    rustsorter::pagerank::RankingHistoryResponse::export_all().unwrap();

    rustsorter::entity_relationships::EntityRelationship::export_all().unwrap();
    rustsorter::entity_relationships::CreateRelationshipPayload::export_all().unwrap();

    println!("TypeScript types generated successfully!");
}