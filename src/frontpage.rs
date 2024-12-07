use actix_web::{get, web, HttpResponse, Responder};
use std::collections::{HashMap, HashSet};

#[derive(serde::Deserialize, Debug)]
struct HierarchyParams {
}

#[derive(serde::Serialize)]
#[serde(tag = "type")]
enum FeedItem {
    Item(crate::tag::Item),
    Vote(crate::tag::Vote),
}

#[derive(serde::Serialize)]
struct HierarchicalItem {
    #[serde(flatten)]
    item: crate::tag::SortedItem,
    children: Vec<HierarchicalItem>,
}

fn build_hierarchy(
    votes: &[crate::tag::Vote],
    items: &[crate::tag::SortedItem],
    item_id_to_elo: &HashMap<&i32, f32>,
) -> Vec<HierarchicalItem> {
    let mut adj: HashMap<i32, HashSet<i32>> = HashMap::new();
    let mut has_parent: HashSet<i32> = HashSet::new();
    
    // Process edges
    let mut edges: Vec<(&crate::tag::Vote, f32)> = votes
        .iter()
        .map(|v| (v, (v.magnitude as f32 - 50.0).abs()))
        .collect();
    
    edges.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    // Process edges with confidence-based rules
    for (vote, vote_confidence) in edges {
        if vote_confidence < 10.0 {
            continue;
        }

        let left_elo = *item_id_to_elo.get(&vote.left_item_id).unwrap_or(&0.0);
        let right_elo = *item_id_to_elo.get(&vote.right_item_id).unwrap_or(&0.0);
        let elo_difference = right_elo - left_elo;
        let elo_confidence = elo_difference.abs();

        let (parent_id, child_id) = if vote_confidence > elo_confidence {
            // Trust vote more
            if vote.magnitude > 50 {
                (vote.right_item_id, vote.left_item_id)
            } else {
                (vote.left_item_id, vote.right_item_id)
            }
        } else {
            // Trust ELO more - higher ELO means more specific (parent)
            if elo_difference > 0.0 {
                (vote.right_item_id, vote.left_item_id)
            } else {
                (vote.left_item_id, vote.right_item_id)
            }
        };

        // Skip if it would create a cycle
        if !would_create_cycle(&adj, parent_id, child_id) {
            adj.entry(parent_id)
                .or_insert_with(|| HashSet::new())
                .insert(child_id);
            has_parent.insert(child_id);
        }
    }

    // Process edges and build initial hierarchy
    let mut path = HashSet::new();
    let mut trees = items.iter()
        .filter(|item| !has_parent.contains(&item.id))
        .map(|item| build_tree(item, &adj, items, &mut path))
        .collect::<Vec<_>>();

    // Find and fix duplicate nodes
    let mut node_parents: HashMap<i32, Vec<(i32, f32)>> = HashMap::new();
    collect_node_parents(&trees, None, item_id_to_elo, &mut node_parents);
    
    // Remove duplicates, keeping only the parent with lowest ELO
    for (node_id, parents) in node_parents.iter() {
        if parents.len() > 1 {
            // Sort parents by ELO (ascending)
            let mut parents = parents.clone();
            parents.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
            
            // Skip the first parent (lowest ELO) and remove from others
            for (parent_id, _) in parents.iter().skip(1) {
                remove_child_from_tree(&mut trees, *parent_id, *node_id);
            }
        }
    }

    trees
}

// Helper function to detect cycles
fn would_create_cycle(adj: &HashMap<i32, HashSet<i32>>, parent: i32, child: i32) -> bool {
    let mut visited = HashSet::new();
    let mut stack = vec![child];
    
    while let Some(current) = stack.pop() {
        if current == parent {
            return true;
        }
        
        if visited.insert(current) {
            // Add all unvisited children to stack
            if let Some(children) = adj.get(&current) {
                stack.extend(children.iter().filter(|&&n| !visited.contains(&n)));
            }
        }
    }
    
    false
}

fn build_tree<'a>(
    root: &'a crate::tag::SortedItem,
    adj: &HashMap<i32, HashSet<i32>>,
    items: &'a [crate::tag::SortedItem],
    path: &mut HashSet<i32>,
) -> HierarchicalItem {
    // If we've seen this node in current path, break the cycle
    if !path.insert(root.id) {
        return HierarchicalItem {
            item: root.clone(),
            children: vec![],
        };
    }

    let children = adj
        .get(&root.id)
        .map(|child_ids| {
            child_ids
                .iter()
                .map(|child_id| {
                    let child = items
                        .iter()
                        .find(|item| item.id == *child_id)
                        .expect("Child ID must exist in items");
                    build_tree(child, adj, items, path)
                })
                .collect()
        })
        .unwrap_or_default();

    // Remove node from path when we're done with it
    path.remove(&root.id);

    HierarchicalItem {
        item: root.clone(),
        children,
    }
}

// New helper functions
fn collect_node_parents(
    items: &[HierarchicalItem],
    parent_id: Option<i32>,
    item_id_to_elo: &HashMap<&i32, f32>,
    node_parents: &mut HashMap<i32, Vec<(i32, f32)>>
) {
    for item in items {
        if let Some(parent_id) = parent_id {
            let parent_elo = *item_id_to_elo.get(&parent_id).unwrap_or(&0.0);
            node_parents
                .entry(item.item.id)
                .or_default()
                .push((parent_id, parent_elo));
        }
        
        collect_node_parents(&item.children, Some(item.item.id), item_id_to_elo, node_parents);
    }
}

fn remove_child_from_tree(
    items: &mut Vec<HierarchicalItem>,
    parent_id: i32,
    child_id: i32,
) -> bool {
    for item in items.iter_mut() {
        if item.item.id == parent_id {
            item.children.retain(|child| child.item.id != child_id);
            return true;
        }
        
        if remove_child_from_tree(&mut item.children, parent_id, child_id) {
            return true;
        }
    }
    false
}

#[get("/api/hierarchy")]
pub async fn hierarchy(
    data: web::Data<crate::AppState>,
    info: web::Query<HierarchyParams>,
) -> impl Responder {
    let items = sqlx::query_as::<_, crate::tag::Item>("SELECT i.* FROM items i 
JOIN tags t ON t.id::text = i.domain_pk 
WHERE i.domain_pk_namespace = 'sorter.tag'")
        .fetch_all(&data.db)
        .await
        .expect("Unable to fetch data from database");

    let votes = {
        let item_ids: Vec<i32> = items.iter().map(|item| item.id).collect();
        let query_str_votes = format!(
            "SELECT * FROM votes WHERE 
                   (left_item_id = ANY($1) AND right_item_id = ANY($1))
                ORDER BY edited_at DESC"
        );
        sqlx::query_as::<_, crate::tag::Vote>(&query_str_votes)
            .bind(&item_ids)
            .fetch_all(&data.db)
            .await
            .expect("Unable to fetch data from database")
    };

    let mut item_to_vote_count = std::collections::HashMap::new();
    for vote in votes.iter() {
        item_to_vote_count
            .entry(vote.left_item_id)
            .and_modify(|e| *e += 1)
            .or_insert(1);

        item_to_vote_count
            .entry(vote.right_item_id)
            .and_modify(|e| *e += 1)
            .or_insert(1);
    }

    let (item_id_to_index, _index_to_item_id, graph) = crate::pagerank::build_graph(&votes);

    let scores = crate::pagerank::page_rank(&graph);
    let item_id_to_elo = item_id_to_index
        .iter()
        .map(|(item_id, index)| {
            let score = scores[*index as usize];
            (item_id, score)
        })
        .collect::<std::collections::HashMap<_, _>>();

    let mut sorted = vec![];
    let mut unsorted = vec![];

    items.iter().for_each(|item| {
        let elo = item_id_to_elo.get(&item.id);
        let vote_count = item_to_vote_count.get(&item.id).unwrap_or(&0);
        match elo {
            Some(elo) => {
                sorted.push(crate::tag::SortedItem {
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
                    elo: *elo,
                    vote_count: *vote_count,
                });
            }
            None => unsorted.push(item.clone()),
        }
    });

    sorted.sort_by(|a, b| b.elo.partial_cmp(&a.elo).unwrap());

    let hierarchy = build_hierarchy(&votes, &sorted, &item_id_to_elo);

    HttpResponse::Ok().json(hierarchy)
}

