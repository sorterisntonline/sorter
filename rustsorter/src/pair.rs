use std::collections::{HashMap, HashSet};

use graph::wcc::UnionFind;
use graph_builder::{DirectedCsrGraph, Graph, index::Idx};
use rand::seq::{IteratorRandom, SliceRandom};

#[derive(Debug, Clone)]
struct Item {
    id: i32,
    title: String,
    body: Option<String>,
    url: Option<String>,
    slug: String,
}

#[derive(Debug, Clone)]
struct SortedItem {
    id: i32,
    title: String,
    slug: String,
    elo: f32,
}

impl Into<Item> for SortedItem {
    fn into(self) -> Item {
        Item {
            id: self.id,
            title: self.title,
            body: None,
            url: None,
            slug: self.slug,
        }
    }
}

#[derive(Debug, Clone)]
struct Skip {
    item_id: i32,
}

#[derive(Debug, Clone)]
struct Vote {
    left_item_id: i32,
    right_item_id: i32,
    magnitude: i32,
}
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