use rand::seq::SliceRandom;
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use graph::prelude::*;

fn get_vote_weight(letter1: char, letter2: char) -> i32 {
    let max_dist = ('Z' as i32) - ('A' as i32);
    let dist = (letter1 as i32 - letter2 as i32).abs();
    
    let base_weight = 50;
    let adjustment = (dist as f32 / max_dist as f32 * 50.0) as i32;
    
    if (letter1 as i32) < (letter2 as i32) {
        base_weight - adjustment
    } else {
        base_weight + adjustment
    }
}

fn generate_letter_comparisons(letters: &[char]) -> Vec<rustsorter::tag::Vote> {
    let mut votes = Vec::new();
    let mut rng = rand::thread_rng();
    
    // Start with first letter as part of graph
    let mut letters_in_graph = vec![letters[0]];
    let mut remaining_letters: Vec<char> = letters[1..].to_vec();
    
    while !remaining_letters.is_empty() {
        let new_letter = remaining_letters.remove(0);
        let existing_letter = *letters_in_graph.choose(&mut rng).unwrap();
        
        let weight = get_vote_weight(existing_letter, new_letter);
        
        // Create vote with dummy IDs based on char positions
        let vote = rustsorter::tag::Vote {
            id: 0,
            owner: "test".to_string(),
            left_item_id: existing_letter as i32,
            right_item_id: new_letter as i32,
            magnitude: weight,
            attribute: 1,
            created_at: chrono::NaiveDateTime::from_timestamp(0, 0),
            edited_at: chrono::NaiveDateTime::from_timestamp(0, 0),
        };
        votes.push(vote);
        
        letters_in_graph.push(new_letter);
    }
    
    votes
}

#[derive(Clone, Copy)]
enum RankAlgorithm {
    PageRank,
    RankCentrality,
}

impl RankAlgorithm {
    fn name(&self) -> &'static str {
        match self {
            RankAlgorithm::PageRank => "pagerank",
            RankAlgorithm::RankCentrality => "rank_centrality",
        }
    }

    fn run(&self, graph: &DirectedCsrGraph<i32, (), i32>) -> Vec<f32> {
        match self {
            RankAlgorithm::PageRank => rustsorter::pagerank::page_rank(graph),
            RankAlgorithm::RankCentrality => rustsorter::pagerank::rank_centrality(graph),
        }
    }
}

fn main() {
    let mut file = File::create("data.txt").expect("Unable to create file");
    writeln!(file, "algorithm,trial,chars,error").expect("Unable to write header");

    let algorithms = [RankAlgorithm::PageRank, RankAlgorithm::RankCentrality];

    // Run multiple trials
    for trial in 0..1000 {
        for chars in 2..=26 {
            let letters: Vec<char> = ('A'..='Z').take(chars).collect();
            let votes = generate_letter_comparisons(&letters);
            
            let (item_id_to_index, index_to_item_id, graph) = rustsorter::pagerank::build_graph(&votes);

            // Test each algorithm
            for &algorithm in &algorithms {
                let scores = algorithm.run(&graph);
                
                let mut letter_scores: Vec<(char, f32)> = scores
                    .iter()
                    .enumerate()
                    .map(|(idx, &score)| {
                        let item_id = index_to_item_id.get(&(idx as i32))
                            .expect(&format!("No mapping found for index {}", idx));
                        (char::from_u32(*item_id as u32).unwrap(), score)
                    })
                    .collect();
                
                letter_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
                
                let ranked_order: Vec<char> = letter_scores.iter().map(|(c, _)| *c).collect();
                let mut errors = 0;
                for i in 0..ranked_order.len()-1 {
                    if ranked_order[i] > ranked_order[i+1] {
                        errors += 1;
                    }
                }

                writeln!(
                    file,
                    "{},{},{},{}",
                    algorithm.name(), trial, chars, errors
                ).expect("Unable to write data");

                if trial == 999 && chars == 26 {
                    println!("\nFinal alphabet ranking for {} in last trial:", algorithm.name());
                    println!("Correct order: ABCDEFGHIJKLMNOPQRSTUVWXYZ");
                    println!("{} order:  {}", algorithm.name(), ranked_order.iter().collect::<String>());
                    println!("Number of errors: {}", errors);
                }
            }

            // Also test random baseline for comparison
            let mut random_order: Vec<char> = letters.clone();
            random_order.shuffle(&mut rand::thread_rng());
            
            let mut random_errors = 0;
            for i in 0..random_order.len()-1 {
                if random_order[i] > random_order[i+1] {
                    random_errors += 1;
                }
            }

            writeln!(
                file,
                "random baseline,{},{},{}",
                trial, chars, random_errors
            ).expect("Unable to write data");

            // Print random baseline for the last trial
            if trial == 999 && chars == 26 {
                println!("Random order:   {}", random_order.iter().collect::<String>());
                println!("Random errors:  {}", random_errors);
            }
        }
    }
}
