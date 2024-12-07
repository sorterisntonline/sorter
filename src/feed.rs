use actix_web::{get, web, HttpResponse, Responder};

#[derive(serde::Deserialize, Debug)]
struct FeedParams {
    tag_id: i32,
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
enum FeedItem {
    Item(crate::tag::Item),
    Vote(crate::tag::Vote),
}

#[get("/api/feed")]
pub async fn feed(
    data: web::Data<crate::AppState>,
    info: web::Query<FeedParams>,
) -> impl Responder {
    let items = sqlx::query_as::<_, crate::tag::Item>(
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
    let votes = sqlx::query_as::<_, crate::tag::Vote>(&query_str_votes)
        .fetch_all(&data.db)
        .await
        .expect("Unable to fetch data from database");

    let mut feed: Vec<FeedItem> = vec![];
    for item in items {
        feed.push(FeedItem::Item(item));
    }
    for vote in votes {
        feed.push(FeedItem::Vote(vote));
    }
    feed.sort_by(|b, a| match a {
        FeedItem::Item(a) => match b {
            FeedItem::Item(b) => a.created_at.cmp(&b.created_at),
            FeedItem::Vote(b) => a.created_at.cmp(&b.created_at),
        },
        FeedItem::Vote(a) => match b {
            FeedItem::Item(b) => a.created_at.cmp(&b.created_at),
            FeedItem::Vote(b) => a.created_at.cmp(&b.created_at),
        },
    });
    return HttpResponse::Ok().json(feed);
}
