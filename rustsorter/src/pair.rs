use std::collections::{HashMap, HashSet};

use graph::wcc::UnionFind;
use graph_builder::{DirectedCsrGraph, Graph, index::Idx};
use rand::seq::{IteratorRandom, SliceRandom};

use crate::tag::{Item, Skip, SortedItem, Vote};

// TODO check for pinned
// TODO check for A A or B B pairs

pub fn pair<'a>(
    sorted: &'a Vec<SortedItem>,
    unsorted: &'a Vec<Item>,
    skips: &'a Vec<Skip>,
    votes: &'a Vec<Vote>,
    pinned_left: Option<i32>,
    pinned_right: Option<i32>,
) -> Vec<Item> {
    let mut sorted = sorted.clone();
    let mut unsorted = unsorted.clone();

    let skipped_items = skips.iter().map(|x| x.item_id).collect::<HashSet<i32>>();

    sorted.retain(|x| !skipped_items.contains(&x.id));
    unsorted.retain(|x| !skipped_items.contains(&x.id));

    if sorted.len() == 0 {
        if unsorted.len() < 2 {
            return vec![];
        } else {
            match (pinned_left, pinned_right) {
                (Some(pinned_left), Some(pinned_right)) => {
                    let pinned_left_item = unsorted
                        .iter()
                        .find(|x| x.id == pinned_left)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| (x.id != pinned_left) && (x.id != pinned_right))
                        .choose_multiple(&mut rand::thread_rng(), 1);

                    return vec![pinned_left_item.clone().into(), sample[0].clone()];
                }
                (None, Some(pinned_right)) => {
                    let pinned_right_item = unsorted
                        .iter()
                        .find(|x| x.id == pinned_right)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| x.id != pinned_right)
                        .choose_multiple(&mut rand::thread_rng(), 1);

                    return vec![pinned_right_item.clone().into(), sample[0].clone()];
                }
                (Some(pinned_left), None) => {
                    let pinned_left_item = unsorted
                        .iter()
                        .find(|x| x.id == pinned_left)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| x.id != pinned_left)
                        .choose_multiple(&mut rand::thread_rng(), 1);
                    return vec![pinned_left_item.clone().into(), sample[0].clone()];
                }
                (None, None) => {
                    let sample = unsorted.iter().choose_multiple(&mut rand::thread_rng(), 2);
                    return sample.into_iter().map(|x| x.clone().into()).collect();
                }
            }
        }
    } else if sorted.len() >= 1 {
        match (pinned_left, pinned_right) {
            (Some(pinned_left), Some(pinned_right)) => {
                // both pinned
                let pinned_left_item = unsorted.iter().find(|x| x.id == pinned_left);
                let pinned_right_item = unsorted.iter().find(|x| x.id == pinned_right);

                match (pinned_left_item, pinned_right_item) {
                    (Some(pinned_left_item), Some(pinned_right_item)) => {
                        return vec![
                            pinned_left_item.clone().into(),
                            pinned_right_item.clone().into(),
                        ];
                    }
                    (Some(_), None) => {
                        // left is pinned, right is not
                        let left = pinned_left_item.unwrap();
                        let right = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![left.clone().into(), right.clone().into()];
                    }
                    (None, Some(_)) => {
                        // left is not pinned, right is
                        let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                        let right = pinned_right_item.unwrap();
                        return vec![left.clone().into(), right.clone().into()];
                    }
                    (None, None) => {
                        // look for them in sorted
                        let left = sorted.iter().find(|x| x.id == pinned_left);
                        let right = sorted.iter().find(|x| x.id == pinned_right);

                        match (left, right) {
                            (Some(left), Some(right)) => {
                                return vec![left.clone().into(), right.clone().into()];
                            }
                            _ => {
                                panic!("pinned item not found 7");
                            }
                        }
                    }
                }
            }
            (Some(pinned_left), None) => {
                let sorted_pinned = sorted.iter().find(|x| x.id == pinned_left);

                match sorted_pinned {
                    Some(pinned) => {
                        // pinned is sorted
                        let left = pinned;
                        let mut sorted = sorted.clone();
                        sorted.sort_by(|a, b| {
                            let a = f32::abs(a.elo - left.elo);
                            let b = f32::abs(b.elo - left.elo);
                            a.partial_cmp(&b).unwrap()
                        });

                        if unsorted.len() > 0 {
                            let right = unsorted.choose(&mut rand::thread_rng()).unwrap();
                            return vec![left.clone().into(), right.clone().into()];
                        }
                        let right = sorted
                            .iter()
                            .take(10)
                            .filter(|x| x.id != left.id)
                            .choose(&mut rand::thread_rng())
                            .unwrap();
                        return vec![left.clone().into(), right.clone().into()];
                    }
                    None => {
                        // pinned is unsorted
                        let pinned = unsorted
                            .iter()
                            .find(|x| x.id == pinned_left)
                            .expect("pinned item not found 3");

                        let right = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![pinned.clone().into(), right.clone().into()];
                    }
                }
            }
            (None, Some(pinned_right)) => {
                // no pinned left
                let sorted_pinned = sorted.iter().find(|x| x.id == pinned_right);

                match sorted_pinned {
                    Some(pinned) => {
                        // pinned is sorted
                        let left = pinned;
                        let mut sorted = sorted.clone();
                        sorted.sort_by(|a, b| {
                            let a = f32::abs(a.elo - left.elo);
                            let b = f32::abs(b.elo - left.elo);
                            a.partial_cmp(&b).unwrap()
                        });

                        if unsorted.len() > 0 {
                            let left = unsorted.choose(&mut rand::thread_rng()).unwrap();
                            return vec![left.clone().into(), pinned.clone().into()];
                        }
                        let left = sorted
                            .iter()
                            .take(10)
                            .filter(|x| x.id != pinned.id)
                            .choose(&mut rand::thread_rng())
                            .unwrap();
                        return vec![left.clone().into(), pinned.clone().into()];
                    }
                    None => {
                        // pinned is unsorted
                        let pinned = unsorted
                            .iter()
                            .find(|x| x.id == pinned_right)
                            .expect("pinned item not found 4");

                        let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![left.clone().into(), pinned.clone().into()];
                    }
                }
            }
            (None, None) => {
                // no pinned
                if unsorted.len() > 0 {
                    let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                    let mut sorted = sorted.clone();
                    sorted.sort_by(|a, b| {
                        let a = f32::abs(a.elo - left.elo);
                        let b = f32::abs(b.elo - left.elo);
                        a.partial_cmp(&b).unwrap()
                    });

                    let right = unsorted.choose(&mut rand::thread_rng()).unwrap();
                    return vec![left.clone().into(), right.clone().into()];
                } else {
                    // go down ranked list, find any n, n+1 pair that isnt voted on already
                    let mut voted_pairs = HashSet::new();
                    for vote in votes {
                        voted_pairs.insert((vote.left_item_id, vote.right_item_id));
                    }

                    let pairs = sorted.windows(2).collect::<Vec<_>>();

                    // find first pair that has not been voted on
                    for pair in pairs {
                        if !voted_pairs.contains(&(pair[0].id, pair[1].id))
                            && !voted_pairs.contains(&(pair[1].id, pair[0].id))
                        {
                            return vec![pair[0].clone().into(), pair[1].clone().into()];
                        }
                    }

                    // if all pairs have been voted on, return a random pair
                    let pair = sorted.choose(&mut rand::thread_rng()).unwrap();
                    let mut sorted = sorted.clone();
                    sorted.sort_by(|a, b| {
                        let a = f32::abs(a.elo - pair.elo);
                        let b = f32::abs(b.elo - pair.elo);
                        a.partial_cmp(&b).unwrap()
                    });

                    let right = sorted
                        .iter()
                        .take(10)
                        .filter(|x| x.id != pair.id)
                        .choose(&mut rand::thread_rng())
                        .unwrap();
                    return vec![pair.clone().into(), right.clone().into()];
                }
            }
        };
    } else {
        panic!("should not be able to reach here");
    }
}

#[cfg(test)]
mod tests {
    use rayon::iter::{IntoParallelIterator, ParallelIterator};

    use crate::{
        pagerank,
        pair::pair,
        tag::{Item, SortedItem, Vote},
    };

    fn vote_correctly_alphabet(left: &Item, right: &Item) -> Vote {
        let diff = (left.id - right.id) as f32;

        let magnitude = (diff / 26.0) * 50.0 + 50.0;

        Vote {
            id: 0,
            left_item_id: left.id,
            right_item_id: right.id,
            magnitude: magnitude as i32,
            owner: "".to_string(),
            attribute: 0,
            created_at: chrono::Utc::now().naive_utc(),
            edited_at: chrono::Utc::now().naive_utc(),
        }
    }

    #[test]
    fn test_algorithm() {
        // TODO setup example that can be pair chosen, measure ranking error over time
        // let alphabet = "abcdefghijklmnopqrstuvwxyz";
        let alphabet = (97 as char..(u8::checked_add(97, 26)).unwrap() as char).collect::<String>();
        let mut items = vec![];
        for (i, c) in alphabet.chars().enumerate() {
            items.push(Item {
                id: i as i32,
                title: c.to_string(),
                body: None,
                url: None,
                slug: "".to_string(),
                owner: "".to_string(),
                domain_pk: None,
                domain_pk_namespace: None,
                created_at: chrono::Utc::now().naive_utc(),
                edited_at: chrono::Utc::now().naive_utc(),
                num_comments: None,
            });
        }

        let algorithms = vec![(pair, "random baseline"), (pair, "random2")];

        println!("algorithm,trial,chars,error");

        for (algorithm, name) in algorithms {
            (0..1000_usize).into_par_iter().for_each(|trial| {
                let mut votes = vec![];

                let mut chars = 0;

                let mut sorted: Vec<SortedItem> = vec![];
                let mut unsorted: Vec<Item> = items.clone();

                loop {
                    chars += 1;
                    for item in &sorted {
                        unsorted.retain(|x| x.id != item.id);
                    }

                    let mut pair;

                    if name == "random baseline" {
                        pair = algorithm(&vec![], &items, &vec![], &votes, None, None);
                    } else {
                        pair = algorithm(&sorted, &unsorted, &vec![], &votes, None, None);
                    }

                    let vote = vote_correctly_alphabet(&pair[0], &pair[1]);
                    votes.push(vote.to_owned());

                    let (item_id_to_index, index_to_item_id, graph) = pagerank::build_graph(&votes);

                    let scores = pagerank::page_rank(&graph);
                    // item id is index into alphabet

                    let mut recreated = vec![];
                    sorted.clear();
                    for (i, score) in scores.iter().enumerate() {
                        recreated.push((
                            alphabet
                                .chars()
                                .nth((*index_to_item_id.get(&(i as i32)).unwrap()) as usize)
                                .unwrap(),
                            score,
                        ));
                        let old_item = &items[*index_to_item_id.get(&(i as i32)).unwrap() as usize];

                        sorted.push(SortedItem {
                            id: old_item.id,
                            owner: "".to_string(),
                            title: "".to_string(),
                            slug: "".to_string(),
                            body: None,
                            domain_pk: None,
                            domain_pk_namespace: None,
                            url: None,
                            created_at: chrono::Utc::now().naive_utc(),
                            edited_at: chrono::Utc::now().naive_utc(),
                            elo: *score,
                            num_comments: None,
                            vote_count: 0,
                        });
                    }
                    sorted.sort_by(|a, b| a.elo.partial_cmp(&b.elo).unwrap());
                    recreated.sort_by(|a, b| a.1.partial_cmp(b.1).unwrap());

                    let final_string = recreated.iter().rev().map(|x| x.0).collect::<String>();

                    let mut error = 0.0;
                    for (i, c) in final_string.chars().enumerate() {
                        error += ((c as i32 - 97 - i as i32).abs() as f32).powf(2.0);
                    }
                    println!("{:?},{},{},{}", name, trial, chars, error);
                    if final_string == alphabet {
                        break;
                    }
                }
            });
        }
    }
}
