use aide::axum::ApiRouter;
use anyhow::anyhow;
use axum::{
    Json,
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};

use crate::{app_state::AppState, models::Error};

const DEFAULT_LIST: &str = "default";

fn default_list() -> String {
    DEFAULT_LIST.to_string()
}

#[derive(Deserialize)]
struct AppendRequest {
    pub value: String,
    #[serde(default = "default_list")]
    pub list: String,
}

#[derive(Deserialize)]
struct ClearRequest {
    #[serde(default = "default_list")]
    pub list: String,
}

#[derive(Deserialize)]
struct ListQuery {
    pub list: Option<String>,
}

#[derive(Serialize)]
pub struct PlaygroundResponse {
    pub list: String,
    pub items: Vec<String>,
}

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .route("/items", get(get_items).post(append_item))
        .route("/clear", post(clear_items))
}

async fn append_item(
    State(state): State<AppState>,
    Json(body): Json<AppendRequest>,
) -> Result<(StatusCode, Json<PlaygroundResponse>), Error> {
    let client = state
        .rama
        .as_ref()
        .ok_or_else(|| Error::Internal(anyhow!("Rama client not configured")))?;

    client
        .append_to_list(&body.list, &body.value)
        .await
        .map_err(Error::Internal)?;

    let items = client.get_list(&body.list).await.map_err(Error::Internal)?;

    Ok((
        StatusCode::CREATED,
        Json(PlaygroundResponse {
            list: body.list,
            items,
        }),
    ))
}

async fn clear_items(
    State(state): State<AppState>,
    Json(body): Json<ClearRequest>,
) -> Result<(StatusCode, Json<PlaygroundResponse>), Error> {
    let client = state
        .rama
        .as_ref()
        .ok_or_else(|| Error::Internal(anyhow!("Rama client not configured")))?;

    client
        .clear_list(&body.list)
        .await
        .map_err(Error::Internal)?;

    let items = client.get_list(&body.list).await.map_err(Error::Internal)?;

    Ok((
        StatusCode::OK,
        Json(PlaygroundResponse {
            list: body.list.clone(),
            items,
        }),
    ))
}

async fn get_items(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<PlaygroundResponse>, Error> {
    let client = state
        .rama
        .as_ref()
        .ok_or_else(|| Error::Internal(anyhow!("Rama client not configured")))?;

    let list = query.list.unwrap_or_else(|| DEFAULT_LIST.to_string());

    let items = client.get_list(&list).await.map_err(Error::Internal)?;

    Ok(Json(PlaygroundResponse { list, items }))
}
