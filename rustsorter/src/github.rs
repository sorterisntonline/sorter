use anyhow::{anyhow, Result};
use aide::axum::ApiRouter;
use axum::{extract::State, http::StatusCode, routing::post};
use chrono::{DateTime, Utc};
use log::{debug, info, warn};
use reqwest;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    app_state::AppState,
    entity,
    extractors::maybe_user::AuthenticatedUser,
    models::{Error, Json},
};

const GITHUB_API_BASE: &str = "https://api.github.com";

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct GitHubRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub owner: GitHubUser,
    pub html_url: String,
    pub description: Option<String>,
    pub language: Option<String>,
    pub stargazers_count: u32,
    pub watchers_count: u32,
    pub forks_count: u32,
    pub open_issues_count: u32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub pushed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct GitHubIssue {
    pub id: u64,
    pub number: u32,
    pub title: String,
    pub body: Option<String>,
    pub state: String, // "open" | "closed"
    pub user: GitHubUser,
    pub assignee: Option<GitHubUser>,
    pub assignees: Vec<GitHubUser>,
    pub labels: Vec<GitHubLabel>,
    pub milestone: Option<GitHubMilestone>,
    pub comments: u32,
    pub html_url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct GitHubUser {
    pub id: u64,
    pub login: String,
    pub avatar_url: String,
    pub html_url: String,
    #[serde(rename = "type")]
    pub user_type: String, // "User" | "Organization"
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct GitHubLabel {
    pub id: u64,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct GitHubMilestone {
    pub id: u64,
    pub number: u32,
    pub title: String,
    pub description: Option<String>,
    pub state: String, // "open" | "closed"
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub due_on: Option<DateTime<Utc>>,
    pub closed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct IngestRepoRequest {
    pub owner: String,
    pub repo: String,
}

#[derive(Debug, Serialize, JsonSchema, TS)]
#[ts(export)]
pub struct IngestRepoResponse {
    pub repo_ns: String,
    pub repo_pk: String,
    pub issues_ingested: u32,
    pub message: String,
}

pub struct GitHubClient {
    client: reqwest::Client,
    token: Option<String>,
}

impl GitHubClient {
    pub fn new(token: Option<String>) -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("User-Agent", "sorter-app/1.0".parse().unwrap());

        if let Some(ref token) = token {
            headers.insert(
                reqwest::header::AUTHORIZATION,
                format!("token {}", token).parse().unwrap(),
            );
        }

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .expect("Failed to build HTTP client");

        Self { client, token }
    }

    pub async fn get_repository(&self, owner: &str, repo: &str) -> Result<GitHubRepo> {
        let url = format!("{}/repos/{}/{}", GITHUB_API_BASE, owner, repo);
        debug!("Fetching repository: {}", url);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(anyhow!("GitHub API error: {}", response.status()));
        }

        let repo_data: GitHubRepo = response.json().await?;
        Ok(repo_data)
    }

    pub async fn get_repository_issues(
        &self,
        owner: &str,
        repo: &str,
        state: &str, // "open", "closed", "all"
        per_page: u32,
    ) -> Result<Vec<GitHubIssue>> {
        let url = format!(
            "{}/repos/{}/{}/issues?state={}&per_page={}&sort=created&direction=desc",
            GITHUB_API_BASE, owner, repo, state, per_page
        );
        debug!("Fetching issues: {}", url);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(anyhow!("GitHub API error: {}", response.status()));
        }

        let issues: Vec<GitHubIssue> = response.json().await?;
        Ok(issues)
    }
}

/// Ingest a GitHub repository and its issues into our entity system
async fn ingest_repository(
    State(state): State<AppState>,
    AuthenticatedUser(_user): AuthenticatedUser,
    Json(payload): Json<IngestRepoRequest>,
) -> Result<(StatusCode, Json<IngestRepoResponse>), Error> {
    info!("Ingesting GitHub repo: {}/{}", payload.owner, payload.repo);

    // TODO: Get GitHub token from env vars
    let github_client = GitHubClient::new(None);

    // Fetch repository data
    let repo_data = github_client
        .get_repository(&payload.owner, &payload.repo)
        .await
        .map_err(|e| Error::BadRequest {
            message: format!("Failed to fetch repository: {}", e).into(),
        })?;

    // Create repository entity
    let repo_entity = entity::create_entity(
        &state.db,
        "github.repo",
        &repo_data.full_name,
        Some(&format!("{} - {}", repo_data.full_name, repo_data.description.as_deref().unwrap_or("GitHub Repository"))),
        Some(&repo_data.owner.avatar_url),
        Some(&serde_json::to_value(&repo_data).unwrap()),
        state.admin_user_id,
    )
    .await
    .map_err(|e| Error::BadRequest {
        message: format!("Failed to create repository entity: {}", e).into(),
    })?;

    // Fetch and ingest issues
    let issues = github_client
        .get_repository_issues(&payload.owner, &payload.repo, "all", 100)
        .await
        .map_err(|e| Error::BadRequest {
            message: format!("Failed to fetch issues: {}", e).into(),
        })?;

    let mut issues_ingested = 0;

    for issue in issues {
        // Create issue entity
        let issue_pk = format!("{}#{}", repo_data.full_name, issue.number);
        match entity::create_entity(
            &state.db,
            "github.issue",
            &issue_pk,
            Some(&issue.title),
            Some(&issue.user.avatar_url),
            Some(&serde_json::to_value(&issue).unwrap()),
            state.admin_user_id,
        ).await {
            Ok(_) => {
                issues_ingested += 1;
                debug!("Ingested issue #{}: {}", issue.number, issue.title);
            }
            Err(e) => {
                warn!("Failed to ingest issue #{}: {}", issue.number, e);
            }
        }
    }

    info!(
        "Ingestion complete: {} with {} issues",
        repo_data.full_name, issues_ingested
    );

    Ok((StatusCode::OK, Json(IngestRepoResponse {
        repo_ns: repo_entity.ns,
        repo_pk: repo_entity.pk,
        issues_ingested,
        message: format!(
            "Successfully ingested {} with {} issues",
            repo_data.full_name, issues_ingested
        ),
    })))
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .route("/ingest", post(ingest_repository))
}