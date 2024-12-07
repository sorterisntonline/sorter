use std::ops::MulAssign;

use rayon::prelude::*;
use rustsorter::tag::Item;
use rustsorter::tag::SortedItem;
use rustsorter::tag::Vote;

pub fn vote_correctly_alphabet(left: &Item, right: &Item) -> Vote {
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
pub fn main() {
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

    let algorithms = vec![
        (rustsorter::pair::pair, "random baseline"),
        (rustsorter::pair::pair, "random2"),
    ];

    println!("algorithm,trial,chars,error");

    for (algorithm, name) in algorithms {
        (0..1000usize).into_par_iter().for_each(|trial| {
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
                    pair = algorithm(&vec![], &items, &vec![], &votes, None);
                } else {
                    pair = algorithm(&sorted, &unsorted, &vec![], &votes, None);
                }

                let vote = vote_correctly_alphabet(&pair[0], &pair[1]);
                votes.push(vote.to_owned());

                let (item_id_to_index, index_to_item_id, graph) =
                    rustsorter::pagerank::build_graph(&votes);

                let scores = rustsorter::pagerank::page_rank(&graph);
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
