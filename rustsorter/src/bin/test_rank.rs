use std::collections::HashMap;
use rayon::prelude::*;
use rand::seq::SliceRandom;
use rustsorter::models::{Item, Vote};

fn get_vote_weight(left: &Item, right: &Item) -> i32 {
    let max_dist = 25.0; // Maximum possible distance (Z-A)
    let dist = (left.id - right.id).abs() as f32;
    
    // Base weight starts at 50 (neutral)
    let base_weight = 50.0;
    let adjustment = (dist / max_dist) * 50.0;
    
    if left.id < right.id {
        (base_weight - adjustment) as i32
    } else {
        (base_weight + adjustment) as i32
    }
}

fn generate_comparisons(items: &Vec<Item>, num_comparisons: usize) -> Vec<Vote> {
    let mut votes = Vec::new();
    let mut items_in_graph = vec![items[0].clone()];
    let mut remaining_items: Vec<Item> = items[1..].to_vec();

    // First ensure connectivity by connecting each new item
    while !remaining_items.is_empty() {
        let new_item = remaining_items.remove(0);
        let existing_item = items_in_graph.choose(&mut rand::thread_rng()).unwrap();
        
        let magnitude = get_vote_weight(&existing_item, &new_item);
        
        votes.push(Vote {
            id: votes.len() as i32,
            left_item_id: existing_item.id,
            right_item_id: new_item.id,
            magnitude,
            owner: "test".to_string(),
            attribute: 0,
            created_at: chrono::Utc::now().naive_utc(),
            edited_at: chrono::Utc::now().naive_utc(),
        });
        
        items_in_graph.push(new_item);
    }

    // Add remaining random comparisons if needed
    while votes.len() < num_comparisons {
        let (left, right) = loop {
            let left = items.choose(&mut rand::thread_rng()).unwrap();
            let right = items.choose(&mut rand::thread_rng()).unwrap();
            if left.id != right.id {
                break (left, right);
            }
        };
        
        let magnitude = get_vote_weight(left, right);
        
        votes.push(Vote {
            id: votes.len() as i32,
            left_item_id: left.id,
            right_item_id: right.id, 
            magnitude,
            owner: "test".to_string(),
            attribute: 0,
            created_at: chrono::Utc::now().naive_utc(),
            edited_at: chrono::Utc::now().naive_utc(),
        });
    }

    votes
}

fn main() {

    // Test different numbers of letters
    for num_letters in 2..27 {
        // Create items for each letter
        let mut items = Vec::new();
        for i in 0..num_letters {
            items.push(Item {
                id: i as i32,
                title: ((b'A' + i as u8) as char).to_string(),
                body: None,
                url: None,
                slug: "".to_string(),
                owner: "test".to_string(),
                domain_pk: None,
                domain_pk_namespace: None,
                created_at: chrono::Utc::now().naive_utc(),
                edited_at: chrono::Utc::now().naive_utc(),
                num_comments: None,
            });
        }

        // Test with different numbers of votes
        for num_votes in [num_letters - 1, num_letters, num_letters * 2] {
            (0..100).into_par_iter().for_each(|trial| {
                let votes = generate_comparisons(&items, num_votes);
                
                let (item_id_to_index, index_to_item_id, graph) = 
                    rustsorter::pagerank::build_graph(&votes);

                let scores = rustsorter::pagerank::page_rank(&graph);

                // Create a vector of (score, item_id) pairs for sorting
                let mut ranked_items: Vec<_> = scores.iter()
                    .enumerate()
                    .map(|(i, &score)| (score, *index_to_item_id.get(&(i as i32)).unwrap()))
                    .collect();
                
                // Sort by score in descending order
                ranked_items.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
                
                // Print the ranked alphabet
                let ranked_alphabet: String = ranked_items.iter()
                    .map(|(_score, item_id)| 
                        ((b'A' + *item_id as u8) as char).to_string())
                    .collect::<Vec<_>>()
                    .join("");
                
                // Create a mapping from item_id to its ranked position
                let mut id_to_rank: HashMap<i32, usize> = HashMap::new();
                for (rank, (_, item_id)) in ranked_items.iter().enumerate() {
                    id_to_rank.insert(*item_id, rank);
                }
                
                // Instead of calculating squared error, calculate Kendall Tau correlation
                let n = num_letters as usize;
                let mut concordant = 0;
                let mut discordant = 0;

                // Compare each pair of items
                for i in 0..n {
                    for j in (i + 1)..n {
                        let id1 = i as i32;
                        let id2 = j as i32;
                        
                        let rank1 = *id_to_rank.get(&id1).unwrap();
                        let rank2 = *id_to_rank.get(&id2).unwrap();
                        
                        // In the expected order, id1 should come before id2
                        // Check if the actual ranking maintains this order
                        if rank1 < rank2 {
                            concordant += 1;
                        } else {
                            discordant += 1;
                        }
                    }
                }

                // Calculate Kendall Tau coefficient
                let total_pairs = (n * (n - 1)) / 2;
                let kendall_tau = (concordant as f32 - discordant as f32) / total_pairs as f32;

                println!("{},{},{},{},{}", num_letters, num_votes, kendall_tau, trial, ranked_alphabet);
            });
        }
    }
}
