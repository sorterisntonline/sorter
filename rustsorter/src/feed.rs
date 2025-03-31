use actix_web::{HttpResponse, Responder, get, web};

#[derive(serde::Deserialize, Debug)]
struct FeedParams {
    tag_id: i32,
}

#[derive(serde::Serialize)]
struct Feed {
    items: Vec<crate::models::Item>,
    votes: Vec<crate::models::Vote>,
}

#[get("/api/feed")]
pub async fn feed(
    data: web::Data<crate::app_state::AppState>,
    info: web::Query<FeedParams>,
) -> impl Responder {
    let items = sqlx::query_as::<_, crate::models::Item>(
        "SELECT * FROM items WHERE id IN (SELECT item_id FROM items_in_tags WHERE tag_id = $1)",
    )
    .bind(info.tag_id)
    .fetch_all(&data.db)
    .await
    .unwrap();

    let query_str_votes = format!(
        "SELECT * FROM votes WHERE
               (left_item_id IN (SELECT item_id FROM items_in_tags WHERE tag_id = {})
            AND right_item_id IN (SELECT item_id FROM items_in_tags WHERE tag_id = {}))
            ORDER BY created_at DESC
            ",
        info.tag_id, info.tag_id
    );
    let votes = sqlx::query_as::<_, crate::models::Vote>(&query_str_votes)
        .fetch_all(&data.db)
        .await
        .expect("Unable to fetch data from database");

    // Sort items by created_at in descending order
    let mut sorted_items = items;
    sorted_items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // Votes are already sorted by created_at DESC from the SQL query

    return HttpResponse::Ok().json(Feed {
        items: sorted_items,
        votes,
    });
}
