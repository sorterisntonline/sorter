use std::collections::HashSet;

use rand::seq::{IteratorRandom, SliceRandom};

#[derive(Debug, Clone)]
struct Item {
    _id: i32,
    _title: String,
    _body: Option<String>,
    _url: Option<String>,
    _slug: String,
}

#[derive(Debug, Clone)]
struct SortedItem {
    id: i32,
    title: String,
    slug: String,
    _elo: f32,
}

impl From<SortedItem> for Item {
    fn from(val: SortedItem) -> Self {
        Item {
            _id: val.id,
            _title: val.title,
            _body: None,
            _url: None,
            _slug: val.slug,
        }
    }
}

#[derive(Debug, Clone)]
struct _Skip {
    item_id: i32,
}

#[derive(Debug, Clone)]
struct _Vote {
    left_item_id: i32,
    right_item_id: i32,
    _magnitude: i32,
}

fn _pair<'a>(
    sorted: &'a [SortedItem],
    unsorted: &'a [Item],
    skips: &'a [_Skip],
    votes: &'a [_Vote],
    pinned_left: Option<i32>,
    pinned_right: Option<i32>,
) -> Vec<Item> {
    let mut sorted = sorted.to_owned();
    let mut unsorted = unsorted.to_owned();

    let skipped_items = skips.iter().map(|x| x.item_id).collect::<HashSet<i32>>();

    sorted.retain(|x| !skipped_items.contains(&x.id));
    unsorted.retain(|x| !skipped_items.contains(&x._id));

    if sorted.is_empty() {
        if unsorted.len() < 2 {
            vec![]
        } else {
            match (pinned_left, pinned_right) {
                (Some(pinned_left), Some(pinned_right)) => {
                    let pinned_left_item = unsorted
                        .iter()
                        .find(|x| x._id == pinned_left)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| (x._id != pinned_left) && (x._id != pinned_right))
                        .choose_multiple(&mut rand::thread_rng(), 1);

                    vec![pinned_left_item.clone(), sample[0].clone()]
                }
                (None, Some(pinned_right)) => {
                    let pinned_right_item = unsorted
                        .iter()
                        .find(|x| x._id == pinned_right)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| x._id != pinned_right)
                        .choose_multiple(&mut rand::thread_rng(), 1);

                    vec![pinned_right_item.clone(), sample[0].clone()]
                }
                (Some(pinned_left), None) => {
                    let pinned_left_item = unsorted
                        .iter()
                        .find(|x| x._id == pinned_left)
                        .expect("pinned item not found");

                    let sample = unsorted
                        .iter()
                        .filter(|x| x._id != pinned_left)
                        .choose_multiple(&mut rand::thread_rng(), 1);
                    vec![pinned_left_item.clone(), sample[0].clone()]
                }
                (None, None) => {
                    let sample = unsorted.iter().choose_multiple(&mut rand::thread_rng(), 2);
                    sample.into_iter().cloned().collect()
                }
            }
        }
    } else if !sorted.is_empty() {
        match (pinned_left, pinned_right) {
            (Some(pinned_left), Some(pinned_right)) => {
                // both pinned
                let pinned_left_item = unsorted.iter().find(|x| x._id == pinned_left);
                let pinned_right_item = unsorted.iter().find(|x| x._id == pinned_right);

                match (pinned_left_item, pinned_right_item) {
                    (Some(pinned_left_item), Some(pinned_right_item)) => {
                        return vec![pinned_left_item.clone(), pinned_right_item.clone()];
                    }
                    (Some(_), None) => {
                        // left is pinned, right is not
                        let left = pinned_left_item.unwrap();
                        let right = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![left.clone(), right.clone().into()];
                    }
                    (None, Some(_)) => {
                        // left is not pinned, right is
                        let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                        let right = pinned_right_item.unwrap();
                        return vec![left.clone().into(), right.clone()];
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
                            let a = f32::abs(a._elo - left._elo);
                            let b = f32::abs(b._elo - left._elo);
                            a.partial_cmp(&b).unwrap()
                        });

                        if !unsorted.is_empty() {
                            let right = unsorted.choose(&mut rand::thread_rng()).unwrap();
                            return vec![left.clone().into(), right.clone()];
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
                            .find(|x| x._id == pinned_left)
                            .expect("pinned item not found 3");

                        let right = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![pinned.clone(), right.clone().into()];
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
                            let a = f32::abs(a._elo - left._elo);
                            let b = f32::abs(b._elo - left._elo);
                            a.partial_cmp(&b).unwrap()
                        });

                        if !unsorted.is_empty() {
                            let left = unsorted.choose(&mut rand::thread_rng()).unwrap();
                            return vec![left.clone(), pinned.clone().into()];
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
                            .find(|x| x._id == pinned_right)
                            .expect("pinned item not found 4");

                        let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                        return vec![left.clone().into(), pinned.clone()];
                    }
                }
            }
            (None, None) => {
                // no pinned
                if !unsorted.is_empty() {
                    let left = sorted.choose(&mut rand::thread_rng()).unwrap();
                    let mut sorted = sorted.clone();
                    sorted.sort_by(|a, b| {
                        let a = f32::abs(a._elo - left._elo);
                        let b = f32::abs(b._elo - left._elo);
                        a.partial_cmp(&b).unwrap()
                    });

                    let right = unsorted.choose(&mut rand::thread_rng()).unwrap();
                    return vec![left.clone().into(), right.clone()];
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
                        let a = f32::abs(a._elo - pair._elo);
                        let b = f32::abs(b._elo - pair._elo);
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
