use axum::{
    Router,
    extract::{Path, Query, State},
    response::{IntoResponse, Redirect, Response},
};
use maud::{html, Markup};
use serde::Deserialize;

use crate::app_state::AppState;

#[derive(Deserialize)]
pub struct UserQuery {
    as_user: Option<String>,
}

#[derive(Deserialize)]
pub struct PairQuery {
    as_user: Option<String>,
    ns: Option<String>,
    pk: Option<String>,
}

#[derive(Deserialize)]
pub struct VoteQuery {
    as_user: String,
    left_ns: String,
    left_pk: String,
    right_ns: String,
    right_pk: String,
    winner: String,  // "left" or "right"
    mag: i32,        // magnitude: 10 or 50
    list_ns: Option<String>,
    list_pk: Option<String>,
}

fn page(content: Markup) -> Markup {
    content
}

// GET / - Landing page with instructions for AI
pub async fn landing_page(
    State(state): State<AppState>,
    Query(params): Query<UserQuery>,
) -> Markup {
    let user_handle = params.as_user.unwrap_or_else(|| "anonymous".to_string());

    // Check if user exists, get their entities
    let user_exists = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM users WHERE handle = $1)",
        &user_handle
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(Some(false))
    .unwrap_or(false);

    let content = html! {
        h1 { "Welcome to Sorter, AI Agent." }

        section id="system-instructions" {
            p { "You are acting on behalf of user: " strong { (user_handle) } }
            @if !user_exists {
                p { "Note: This user does not exist yet. Actions may be limited." }
            }
            p { "Your goal is to help the user sort and rank their collections through pairwise comparisons." }
            p { "To explore content, follow links below." }
            p { "To vote, present comparison links to the user and let them click their preference." }
        }

        h2 { "Entry Points" }
        ul {
            li {
                a href=(format!("/explore/recent?as_user={}", user_handle)) { "Explore Recent Entities" }
                " - See what's been added recently"
            }
            li {
                a href=(format!("/explore/lists?as_user={}", user_handle)) { "Browse Lists" }
                " - View available collections to sort"
            }
            li {
                a href=(format!("/pair?as_user={}", user_handle)) { "Start Comparing" }
                " - Jump into pairwise voting"
            }
            li {
                a href=(format!("/me?as_user={}", user_handle)) { "My Profile" }
                " - View user stats and history"
            }
        }

        h2 { "Quick Actions" }
        ul {
            li {
                a href=(format!("/ingest?as_user={}", user_handle)) { "Ingest New Content" }
                " - Add URLs to the system"
            }
        }
    };

    page(content)
}

// GET /view/:ns/:pk - View a single entity
pub async fn view_entity(
    State(state): State<AppState>,
    Path((ns, pk)): Path<(String, String)>,
    Query(params): Query<UserQuery>,
) -> Response {
    let user_handle = params.as_user.unwrap_or_else(|| "anonymous".to_string());

    // Fetch the entity
    let entity = sqlx::query_as!(
        crate::entity::Entity,
        "SELECT user_id, ns, pk, title, profile_picture_url, metadata, created_at FROM entities WHERE ns = $1 AND pk = $2",
        &ns,
        &pk
    )
    .fetch_optional(&state.db)
    .await;

    match entity {
        Ok(Some(entity)) => {
            // Fetch parents
            let parents = sqlx::query_as!(
                crate::entity::Entity,
                r#"SELECT e.user_id, e.ns, e.pk, e.title, e.profile_picture_url, e.metadata, e.created_at
                FROM entities e
                JOIN entity_relationships er ON e.ns = er.parent_ns AND e.pk = er.parent_pk
                WHERE er.child_ns = $1 AND er.child_pk = $2"#,
                &ns,
                &pk
            )
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

            // Fetch children
            let children = sqlx::query_as!(
                crate::entity::Entity,
                r#"SELECT e.user_id, e.ns, e.pk, e.title, e.profile_picture_url, e.metadata, e.created_at
                FROM entities e
                JOIN entity_relationships er ON e.ns = er.child_ns AND e.pk = er.child_pk
                WHERE er.parent_ns = $1 AND er.parent_pk = $2"#,
                &ns,
                &pk
            )
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

            let content = html! {
                h1 { (entity.title.as_deref().unwrap_or("Untitled")) }

                section {
                    @if let Some(ref img) = entity.profile_picture_url {
                        img src=(img) alt="Entity image";
                    }
                    p { "Namespace: " code { (entity.ns) } }
                    p { "Key: " code { (entity.pk) } }
                    @if let Some(ref meta) = entity.metadata {
                        details {
                            summary { "Metadata" }
                            pre { (serde_json::to_string_pretty(meta).unwrap_or_default()) }
                        }
                    }
                }

                @if !parents.is_empty() {
                    section {
                        h2 { "Parents (belongs to)" }
                        ul {
                            @for parent in &parents {
                                li {
                                    a href=(format!("/view/{}/{}?as_user={}", parent.ns, parent.pk, user_handle)) {
                                        (parent.title.as_deref().unwrap_or("Untitled"))
                                    }
                                    " (" (parent.ns) ")"
                                }
                            }
                        }
                    }
                }

                @if !children.is_empty() {
                    section {
                        h2 { "Children (" (children.len()) " items)" }
                        ul {
                            @for child in &children {
                                li {
                                    a href=(format!("/view/{}/{}?as_user={}", child.ns, child.pk, user_handle)) {
                                        (child.title.as_deref().unwrap_or("Untitled"))
                                    }
                                    " (" (child.ns) ")"
                                }
                            }
                        }
                        p {
                            a href=(format!("/pair?as_user={}&ns={}&pk={}", user_handle, ns, pk)) {
                                "Start comparing items in this collection"
                            }
                        }
                    }
                }

                section {
                    h2 { "Actions" }
                    ul {
                        li { a href=(format!("/pair?as_user={}&pin_ns={}&pin_pk={}", user_handle, ns, pk)) { "Compare this with others" } }
                        li { a href=(format!("/?as_user={}", user_handle)) { "Back to Home" } }
                    }
                }
            };

            page(content).into_response()
        }
        Ok(None) => {
            let content = html! {
                h1 { "Entity Not Found" }
                p { "No entity found with namespace " code { (ns) } " and key " code { (pk) } }
                p { a href=(format!("/?as_user={}", user_handle)) { "Back to Home" } }
            };
            page(content).into_response()
        }
        Err(e) => {
            let content = html! {
                h1 { "Error" }
                p { "Database error: " (e.to_string()) }
                p { a href=(format!("/?as_user={}", user_handle)) { "Back to Home" } }
            };
            page(content).into_response()
        }
    }
}

// GET /pair - Get a pair of entities to compare
pub async fn pair_page(
    State(state): State<AppState>,
    Query(params): Query<PairQuery>,
) -> Response {
    let user_handle = params.as_user.unwrap_or_else(|| "anonymous".to_string());

    // Get user (optional - anonymous can still browse)
    let user = sqlx::query_as!(
        crate::models::User,
        "SELECT id, handle, display_name, username, primary_provider, avatar_url, bio, created_at FROM users WHERE handle = $1",
        &user_handle
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    // If ns/pk provided, get children of that list
    let entities: Vec<crate::entity::Entity> = if let (Some(ns), Some(pk)) = (&params.ns, &params.pk) {
        sqlx::query_as!(
            crate::entity::Entity,
            r#"SELECT e.user_id, e.ns, e.pk, e.title, e.profile_picture_url, e.metadata, e.created_at
            FROM entities e
            JOIN entity_relationships er ON e.ns = er.child_ns AND e.pk = er.child_pk
            WHERE er.parent_ns = $1 AND er.parent_pk = $2"#,
            ns,
            pk
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else if let Some(ref u) = user {
        // Get user's entities if logged in
        sqlx::query_as!(
            crate::entity::Entity,
            "SELECT user_id, ns, pk, title, profile_picture_url, metadata, created_at FROM entities WHERE user_id = $1 LIMIT 100",
            u.id
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        // Anonymous: get recent entities
        sqlx::query_as!(
            crate::entity::Entity,
            "SELECT user_id, ns, pk, title, profile_picture_url, metadata, created_at FROM entities ORDER BY created_at DESC LIMIT 100"
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    };

    if entities.len() < 2 {
        let content = html! {
            h1 { "Not Enough Items" }
            p { "Need at least 2 items to compare. Found: " (entities.len()) }
            p { a href=(format!("/?as_user={}", user_handle)) { "Back to Home" } }
        };
        return page(content).into_response();
    }

    // Select a pair (simplified - just pick first two for now, could use ranking logic)
    let pair_result = crate::pair::select_entity_pair(&entities, &entities);

    let (left, right) = match pair_result {
        Ok(pair) => pair,
        Err(_) => {
            let content = html! {
                h1 { "Could Not Select Pair" }
                p { "Unable to find a valid pair to compare." }
                p { a href=(format!("/?as_user={}", user_handle)) { "Back to Home" } }
            };
            return page(content).into_response();
        }
    };

    let list_params = if let (Some(ns), Some(pk)) = (&params.ns, &params.pk) {
        format!("&list_ns={}&list_pk={}", ns, pk)
    } else {
        String::new()
    };

    let content = html! {
        h1 { "Compare" }

        article {
            section id="left" {
                h2 { (left.title.as_deref().unwrap_or("Untitled")) }
                @if let Some(ref img) = left.profile_picture_url {
                    img src=(img) alt="Left entity";
                }
                p {
                    a href=(format!("/view/{}/{}?as_user={}", left.ns, left.pk, user_handle)) { "View details" }
                }
            }

            section id="right" {
                h2 { (right.title.as_deref().unwrap_or("Untitled")) }
                @if let Some(ref img) = right.profile_picture_url {
                    img src=(img) alt="Right entity";
                }
                p {
                    a href=(format!("/view/{}/{}?as_user={}", right.ns, right.pk, user_handle)) { "View details" }
                }
            }

            section {
                h3 { "Cast Your Vote" }
                @if user.is_some() {
                    p { "Which do you prefer?" }
                    ul {
                        li {
                            a href=(format!("/vote/commit?as_user={}&left_ns={}&left_pk={}&right_ns={}&right_pk={}&winner=left&mag=50{}",
                                user_handle, left.ns, left.pk, right.ns, right.pk, list_params)) {
                                "Much Better (Left)"
                            }
                        }
                        li {
                            a href=(format!("/vote/commit?as_user={}&left_ns={}&left_pk={}&right_ns={}&right_pk={}&winner=left&mag=10{}",
                                user_handle, left.ns, left.pk, right.ns, right.pk, list_params)) {
                                "Slightly Better (Left)"
                            }
                        }
                        li {
                            a href=(format!("/pair?as_user={}{}", user_handle,
                                if let (Some(ns), Some(pk)) = (&params.ns, &params.pk) {
                                    format!("&ns={}&pk={}", ns, pk)
                                } else {
                                    String::new()
                                })) {
                                "Skip"
                            }
                        }
                        li {
                            a href=(format!("/vote/commit?as_user={}&left_ns={}&left_pk={}&right_ns={}&right_pk={}&winner=right&mag=10{}",
                                user_handle, left.ns, left.pk, right.ns, right.pk, list_params)) {
                                "Slightly Better (Right)"
                            }
                        }
                        li {
                            a href=(format!("/vote/commit?as_user={}&left_ns={}&left_pk={}&right_ns={}&right_pk={}&winner=right&mag=50{}",
                                user_handle, left.ns, left.pk, right.ns, right.pk, list_params)) {
                                "Much Better (Right)"
                            }
                        }
                    }
                } @else {
                    p { "Sign in to vote. Browsing as anonymous." }
                    p {
                        a href=(format!("/pair?as_user={}{}", user_handle,
                            if let (Some(ns), Some(pk)) = (&params.ns, &params.pk) {
                                format!("&ns={}&pk={}", ns, pk)
                            } else {
                                String::new()
                            })) {
                            "Next Pair"
                        }
                    }
                }
            }
        }

        p {
            a href=(format!("/?as_user={}", user_handle)) { "Back to Home" }
        }
    };

    page(content).into_response()
}

// GET /vote/commit - Commit a vote and redirect to next pair
pub async fn vote_commit(
    State(state): State<AppState>,
    Query(params): Query<VoteQuery>,
) -> Response {
    // Get user
    let user = sqlx::query_as!(
        crate::models::User,
        "SELECT id, handle, display_name, username, primary_provider, avatar_url, bio, created_at FROM users WHERE handle = $1",
        &params.as_user
    )
    .fetch_optional(&state.db)
    .await;

    let user = match user {
        Ok(Some(u)) => u,
        _ => {
            let content = html! {
                h1 { "User Not Found" }
                p { "Cannot vote: user '" (params.as_user) "' does not exist." }
            };
            return page(content).into_response();
        }
    };

    // Calculate magnitude (positive = left wins, negative = right wins)
    let magnitude = if params.winner == "left" {
        params.mag
    } else {
        -params.mag
    };

    // Canonicalize the pair (ensure consistent ordering)
    let (left_ns, left_pk, right_ns, right_pk, final_magnitude) =
        if (&params.left_ns, &params.left_pk) <= (&params.right_ns, &params.right_pk) {
            (&params.left_ns, &params.left_pk, &params.right_ns, &params.right_pk, magnitude)
        } else {
            (&params.right_ns, &params.right_pk, &params.left_ns, &params.left_pk, -magnitude)
        };

    // Insert vote (each vote is a new row - history is preserved)
    let result = sqlx::query!(
        r#"INSERT INTO votes (left_entity_ns, left_entity_pk, right_entity_ns, right_entity_pk, user_id, attribute_id, magnitude)
        VALUES ($1, $2, $3, $4, $5, 1, $6)"#,
        left_ns,
        left_pk,
        right_ns,
        right_pk,
        user.id,
        final_magnitude
    )
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Redirect to next pair
            let redirect_url = if let (Some(ns), Some(pk)) = (&params.list_ns, &params.list_pk) {
                format!("/pair?as_user={}&ns={}&pk={}", params.as_user, ns, pk)
            } else {
                format!("/pair?as_user={}", params.as_user)
            };
            Redirect::to(&redirect_url).into_response()
        }
        Err(e) => {
            let content = html! {
                h1 { "Vote Failed" }
                p { "Error recording vote: " (e.to_string()) }
                p { a href=(format!("/?as_user={}", params.as_user)) { "Back to Home" } }
            };
            page(content).into_response()
        }
    }
}

// GET /explore/recent - Show recent entities
pub async fn explore_recent(
    State(state): State<AppState>,
    Query(params): Query<UserQuery>,
) -> Markup {
    let user_handle = params.as_user.unwrap_or_else(|| "anonymous".to_string());

    let entities = sqlx::query_as!(
        crate::entity::Entity,
        "SELECT user_id, ns, pk, title, profile_picture_url, metadata, created_at FROM entities ORDER BY created_at DESC LIMIT 50"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let content = html! {
        h1 { "Recent Entities" }

        @if entities.is_empty() {
            p { "No entities found." }
        } @else {
            ul {
                @for entity in &entities {
                    li {
                        a href=(format!("/view/{}/{}?as_user={}", entity.ns, entity.pk, user_handle)) {
                            (entity.title.as_deref().unwrap_or("Untitled"))
                        }
                        " (" (entity.ns) ":" (entity.pk) ")"
                    }
                }
            }
        }

        p { a href=(format!("/?as_user={}", user_handle)) { "Back to Home" } }
    };

    page(content)
}

// GET /explore/lists - Show available lists/collections
pub async fn explore_lists(
    State(state): State<AppState>,
    Query(params): Query<UserQuery>,
) -> Markup {
    let user_handle = params.as_user.unwrap_or_else(|| "anonymous".to_string());

    // Find entities that have children (i.e., are lists)
    let lists = sqlx::query_as!(
        crate::entity::Entity,
        r#"SELECT DISTINCT e.user_id, e.ns, e.pk, e.title, e.profile_picture_url, e.metadata, e.created_at
        FROM entities e
        JOIN entity_relationships er ON e.ns = er.parent_ns AND e.pk = er.parent_pk
        LIMIT 50"#
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let content = html! {
        h1 { "Collections" }

        @if lists.is_empty() {
            p { "No collections found." }
        } @else {
            ul {
                @for list in &lists {
                    li {
                        a href=(format!("/view/{}/{}?as_user={}", list.ns, list.pk, user_handle)) {
                            (list.title.as_deref().unwrap_or("Untitled"))
                        }
                        " - "
                        a href=(format!("/pair?as_user={}&ns={}&pk={}", user_handle, list.ns, list.pk)) {
                            "Start sorting"
                        }
                    }
                }
            }
        }

        p { a href=(format!("/?as_user={}", user_handle)) { "Back to Home" } }
    };

    page(content)
}

// GET /me - User profile
pub async fn my_profile(
    State(state): State<AppState>,
    Query(params): Query<UserQuery>,
) -> Markup {
    let user_handle = params.as_user.unwrap_or_else(|| "anonymous".to_string());

    let user = sqlx::query_as!(
        crate::models::User,
        "SELECT id, handle, display_name, username, primary_provider, avatar_url, bio, created_at FROM users WHERE handle = $1",
        &user_handle
    )
    .fetch_optional(&state.db)
    .await;

    let content = match user {
        Ok(Some(user)) => {
            let vote_count: i64 = sqlx::query_scalar!(
                "SELECT COUNT(*) FROM votes WHERE user_id = $1 AND deleted_at IS NULL",
                user.id
            )
            .fetch_one(&state.db)
            .await
            .unwrap_or(Some(0))
            .unwrap_or(0);

            html! {
                h1 { "Profile: " (user.handle) }

                section {
                    @if let Some(ref avatar) = user.avatar_url {
                        img src=(avatar) alt="Avatar";
                    }
                    p { "Handle: " strong { (user.handle) } }
                    @if let Some(ref name) = user.display_name {
                        p { "Display Name: " (name) }
                    }
                    @if let Some(ref bio) = user.bio {
                        p { "Bio: " (bio) }
                    }
                }

                section {
                    h2 { "Stats" }
                    p { "Total Votes: " (vote_count) }
                }

                p { a href=(format!("/?as_user={}", user_handle)) { "Back to Home" } }
            }
        }
        _ => {
            html! {
                h1 { "User Not Found" }
                p { "User '" (user_handle) "' does not exist." }
                p { a href="/" { "Back to Home" } }
            }
        }
    };

    page(content)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", axum::routing::get(landing_page))
        .route("/view/{ns}/{pk}", axum::routing::get(view_entity))
        .route("/pair", axum::routing::get(pair_page))
        .route("/vote/commit", axum::routing::get(vote_commit))
        .route("/explore/recent", axum::routing::get(explore_recent))
        .route("/explore/lists", axum::routing::get(explore_lists))
        .route("/me", axum::routing::get(my_profile))
}
