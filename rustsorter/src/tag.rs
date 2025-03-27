use std::{
    collections::{HashMap, HashSet},
    vec,
};

use actix_web::{HttpResponse, Responder, get, web};
use sqlx::types::chrono;
use crate::AppState;

use crate::models::{Tag, Item, SortedItem, Vote, Skip, Attribute, User, UserDb, Perms};

#[derive(serde::Deserialize, Debug)]
struct TagInfo {
    id: Option<i32>,
    users: Option<String>,
    pinned_left: Option<i32>,
    pinned_right: Option<i32>,
    user_name: Option<String>,
    elo: Option<bool>,
    attribute: Option<String>,
    namespace: Option<String>,
}


#[derive(serde::Serialize)]
struct TagPageResponse<'a> {
    tag: Tag,
    sorted: &'a Vec<SortedItem>,
    unsorted: &'a Vec<Item>,
    skipped: &'a Vec<Item>,
    perms: Perms,
    users_who_voted: Vec<User>,
    pair: Vec<Item>,
    votes: &'a Vec<Vote>,
    attributes: Vec<Attribute>,
    selected_attribute: Attribute,
}

#[derive(sqlx::FromRow)]
struct GroupUser {
    user_id: String,
    usergroup_id: String,
}

async fn get_items_from_tagid(tag_id: i32, db: &sqlx::PgPool) -> Vec<Item> {
    let query_str = format!(
        "SELECT
            i.*,
            COUNT(c.id) AS num_comments
        FROM items i
        JOIN items_in_tags it ON i.id = it.item_id
        LEFT JOIN comments c ON i.id = c.pk AND c.pk_namespace = 'item'
        WHERE it.tag_id = {}
        GROUP BY i.id;",
        tag_id
    );
    // TODO! gather itemids, then gather comments from those item ids, just a count
    let items: _ = sqlx::query_as::<_, Item>(&query_str)
        .fetch_all(db)
        .await
        .expect("Unable to fetch data from database");

    return items;
}

#[get("/api/tag/page")]
pub async fn hello(data: web::Data<crate::AppState>, info: web::Query<TagInfo>) -> impl Responder {
    let items = get_items_from_tagid(info.id.expect("Tag ID should be present"), &data.db).await;

    let tag = if info.namespace == None {
        sqlx::query_as::<_, Tag>("SELECT * FROM tags WHERE id = $1")
            .bind(info.id.expect("Tag ID should be present"))
            .fetch_one(&data.db)
            .await
            .expect("Unable to fetch data from database")
    } else {
        Tag {
            id: -1,
            owner: "".to_string(),
            title: "".to_string(),
            slug: info.namespace.clone().expect("Namespace should be present"),
            description: None,
            domain_pk: None,
            domain_pk_namespace: None,
            domain_url: None,
            ns: Some("namespace".to_string()),
            created_at: chrono::NaiveDateTime::from_timestamp(0, 0),
            edited_at: chrono::NaiveDateTime::from_timestamp(0, 0),
            unlisted: false,
            nsfw: false,
            hide_item_authors: false,
        }
    };

    let votes = {
        let item_ids: Vec<i32> = items.iter().map(|item| item.id).collect();
        let query_str_votes = format!(
            "SELECT * FROM votes WHERE
                   (left_item_id = ANY($1) AND right_item_id = ANY($1))
                ORDER BY edited_at DESC"
        );
        sqlx::query_as::<_, Vote>(&query_str_votes)
            .bind(&item_ids)
            .fetch_all(&data.db)
            .await
            .expect("Unable to fetch data from database")
    };

    let mut users_who_voted_set = HashSet::new();

    let mut attributes = sqlx::query_as::<_, Attribute>("SELECT * FROM attributes")
        .fetch_all(&data.db)
        .await
        .expect("Unable to fetch data from database");

    let mut attribute_counts = HashMap::new();
    for vote in votes.iter() {
        attribute_counts
            .entry(vote.attribute)
            .and_modify(|e| *e += 1)
            .or_insert(1);
    }
    for attribute in attributes.iter_mut() {
        attribute.votes = attribute_counts.get(&attribute.id).unwrap_or(&0).clone();
    }
    attributes.sort_by(|a, b| b.votes.cmp(&a.votes));

    let selected_attribute = match info.attribute.clone() {
        Some(attribute) => {
            // TODO make new attribute if it doesn't exist/ or just filter out all votes if
            // it doesn't exist
            sqlx::query_as::<_, Attribute>("SELECT * FROM attributes WHERE title = $1")
                .bind(attribute.clone())
                .fetch_one(&data.db)
                .await
                .unwrap_or(Attribute {
                    id: -1,
                    owner: "".to_string(),
                    title: attribute,
                    description: None,
                    created_at: chrono::NaiveDateTime::from_timestamp(0, 0),
                    edited_at: chrono::NaiveDateTime::from_timestamp(0, 0),
                    votes: 0,
                })
        }
        None => {
            let selected_attribute_id = attribute_counts
                .iter()
                .max_by(|a, b| a.1.cmp(b.1))
                .map(|(k, _v)| *k)
                .unwrap_or(0);

            sqlx::query_as::<_, Attribute>("SELECT * FROM attributes WHERE id = $1")
                .bind(selected_attribute_id)
                .fetch_one(&data.db)
                .await
                .expect("Unable to fetch data from database")
        }
    };

    let mut filteredvotes: Vec<Vote> = vec![];
    let mut item_to_vote_count = HashMap::new();

    let userstrings = match &info.users {
        Some(users) => Some(users.split(".")),
        None => None,
    };
    let mut userset = HashSet::new();
    if let Some(users) = userstrings {
        for user in users {
            let maybe_group = sqlx::query_as!(
                GroupUser,
                "SELECT DISTINCT user_id, usergroup_id FROM users_in_usergroups WHERE \
                 usergroup_id = $1",
                user
            )
            .fetch_all(&data.db)
            .await
            .expect("Unable to fetch data from database");
            if (maybe_group.len() > 0) {
                for group in maybe_group {
                    userset.insert(group.user_id.clone());
                }
            } else {
                userset.insert(user.to_string());
            }
        }
    }

    for vote in votes.iter() {
        users_who_voted_set.insert(vote.owner.clone());
        if info.users != None {
            if !userset.contains(&vote.owner) {
                continue;
            }
        }
        if selected_attribute.id != vote.attribute {
            continue;
        }
        filteredvotes.push(vote.clone());
        item_to_vote_count
            .entry(vote.left_item_id)
            .and_modify(|e| *e += 1)
            .or_insert(1);

        item_to_vote_count
            .entry(vote.right_item_id)
            .and_modify(|e| *e += 1)
            .or_insert(1);
    }

    let mut sorted = vec![];
    let mut unsorted = vec![];

    if info.elo == None {
        let (item_id_to_index, index_to_item_id, graph) =
            crate::pagerank::build_graph(&filteredvotes);

        let scores = crate::pagerank::page_rank(&graph);
        let item_id_to_elo = item_id_to_index
            .iter()
            .map(|(item_id, index)| {
                let score = scores[*index as usize];
                (item_id, score)
            })
            .collect::<std::collections::HashMap<_, _>>();
        items.iter().for_each(|item| {
            let elo = item_id_to_elo.get(&item.id);
            let vote_count = item_to_vote_count.get(&item.id).unwrap_or(&0);
            match elo {
                Some(elo) => {
                    sorted.push(SortedItem {
                        id: item.id,
                        owner: item.owner.clone(),
                        title: item.title.clone(),
                        slug: item.slug.clone(),
                        body: item.body.clone(),
                        domain_pk: item.domain_pk.clone(),
                        domain_pk_namespace: item.domain_pk_namespace.clone(),
                        url: item.url.clone(),
                        num_comments: item.num_comments,
                        created_at: item.created_at,
                        edited_at: item.edited_at,
                        elo: *elo,
                        vote_count: *vote_count,
                    });
                }
                None => unsorted.push(item.clone()),
            }
        });
    } else {
        let elo = elo::EloRank { k: 32 };
        let mut item_id_to_idx = std::collections::HashMap::new();
        let mut idx_to_item_id = std::collections::HashMap::new();

        let mut elos = vec![];
        for (..) in items.iter().enumerate() {
            elos.push(1600.0);
        }

        for (i, item) in items.iter().enumerate() {
            item_id_to_idx.insert(item.id, i as i32);
            idx_to_item_id.insert(i as i32, item.id);
        }

        for vote in filteredvotes.iter() {
            let leftitem = item_id_to_idx.get(&vote.left_item_id).unwrap();
            let rightitem = item_id_to_idx.get(&vote.right_item_id).unwrap();
            if vote.magnitude == 50 {
                continue;
            }
            let loser = if vote.magnitude > 50 {
                *leftitem
            } else {
                *rightitem
            };
            let winner = if vote.magnitude > 50 {
                *rightitem
            } else {
                *leftitem
            };

            let (winner_score, loser_score) =
                elo.calculate(elos[winner as usize], elos[loser as usize]);

            elos[winner as usize] = winner_score;
            elos[loser as usize] = loser_score;
        }

        for (i, item) in items.iter().enumerate() {
            sorted.push(SortedItem {
                id: item.id,
                owner: item.owner.clone(),
                title: item.title.clone(),
                slug: item.slug.clone(),
                body: item.body.clone(),
                domain_pk: item.domain_pk.clone(),
                domain_pk_namespace: item.domain_pk_namespace.clone(),
                url: item.url.clone(),
                created_at: item.created_at,
                edited_at: item.edited_at,
                num_comments: item.num_comments,
                elo: elos[i] as f32,
                vote_count: *item_to_vote_count.get(&item.id).unwrap_or(&0),
            });
        }
    }

    sorted.sort_by(|a, b| b.elo.partial_cmp(&a.elo).unwrap());

    let mut users_who_voted = users_who_voted_set
        .into_iter()
        .map(|x| User {
            user_name: x,
            owner: None,
        })
        .collect::<Vec<_>>();

    let groups_who_voted = sqlx::query_as!(
        UserDb,
        "SELECT DISTINCT user_name, owner FROM users_in_usergroups INNER JOIN usergroups ON \
         user_name = usergroup_id WHERE user_id = ANY($1)",
        &users_who_voted
            .iter()
            .map(|x| x.user_name.clone())
            .collect::<Vec<String>>()
    )
    .fetch_all(&data.db)
    .await
    .expect("Unable to fetch data from database");

    users_who_voted.extend(groups_who_voted.iter().map(|x| User {
        user_name: x.user_name.clone(),
        owner: Some(x.owner.clone()),
    }));

    let skips = match &info.user_name {
        Some(user_name) => {
            let item_ids: Vec<i32> = items.iter().map(|item| item.id).collect();
            sqlx::query_as!(
                Skip,
                "SELECT * FROM skipped WHERE owner = $1 AND item_id = ANY($2)",
                user_name,
                &item_ids
            )
            .fetch_all(&data.db)
            .await
            .expect("Unable to fetch data from database")
        }
        None => vec![],
    };

    let mut pair = vec![];
    let mut count = 0;
    loop {
        count += 1;
        pair = crate::pair::pair(
            &sorted,
            &unsorted,
            &skips,
            &votes,
            info.pinned_left,
            info.pinned_right,
        );
        // check if pair has been voted on for this user
        if pair.len() < 2 {
            break;
        }
        let existing_pair = sqlx::query!(
            "SELECT * FROM votes WHERE owner = $1 AND (left_item_id = $2 AND right_item_id = $3) \
             OR (left_item_id = $3 AND right_item_id = $2)",
            info.user_name,
            pair[0].id,
            pair[1].id
        )
        .fetch_optional(&data.db)
        .await
        .expect("Unable to fetch data from database");

        if count > 10 {
            break;
        }

        match existing_pair {
            Some(_) => {
                continue;
            }
            None => {
                break;
            }
        }
    }
    // let pair = vec![];

    let perms = if info.id.is_none() {
        Perms {
            can_vote: true,
            can_add: false,
            can_view: true,
        }
    } else {
        Perms {
            can_vote: crate::perms::can("vote", &tag, &info.user_name, &data.db).await,
            can_add: crate::perms::can("add", &tag, &info.user_name, &data.db).await,
            can_view: crate::perms::can("view", &tag, &info.user_name, &data.db).await,
        }
    };

    let skipped = vec![];

    HttpResponse::Ok().json(TagPageResponse {
        tag,
        sorted: &sorted,
        unsorted: &unsorted,
        skipped: &skipped,
        votes: &votes,
        users_who_voted,
        pair,
        perms,
        attributes,
        selected_attribute,
    })
}
