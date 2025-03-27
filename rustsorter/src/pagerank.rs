use std::collections::HashMap;

use graph::prelude::*;

use crate::models::Vote;

pub fn build_graph(
    filteredvotes: &Vec<Vote>,
) -> (
    HashMap<i32, i32>,
    HashMap<i32, i32>,
    DirectedCsrGraph<i32, (), i32>,
) {
    let mut item_id_to_index = std::collections::HashMap::new();
    let mut index_to_item_id = std::collections::HashMap::new();
    let mut edges = vec![];

    for vote in filteredvotes.iter() {
        let mut next_id = item_id_to_index.len() as i32;
        let left = *item_id_to_index
            .entry(vote.left_item_id)
            .or_insert_with(|| next_id);

        index_to_item_id.insert(left, vote.left_item_id);

        next_id = item_id_to_index.len() as i32;
        let right = *item_id_to_index
            .entry(vote.right_item_id)
            .or_insert_with(|| next_id);

        index_to_item_id.insert(right, vote.right_item_id);

        edges.push((left, right, vote.magnitude));
        edges.push((right, left, 100 - vote.magnitude));
    }
    let graph: DirectedCsrGraph<i32, (), i32> =
        GraphBuilder::new().edges_with_values(edges).build();

    return (item_id_to_index, index_to_item_id, graph);
}

pub fn page_rank_iteration(
    graph: &DirectedCsrGraph<i32, (), i32>,
    scores: &mut Vec<f32>,
    out_degrees: &Vec<i32>,
    max_out_degree: i32,
) {
    let node_count = graph.node_count();

    let mut new_scores = vec![0_f32; node_count as usize];

    for node in 0..node_count {
        let out_degree = out_degrees[node as usize];

        let self_degree = max_out_degree - out_degree;
        let rest_degree = out_degree;
        let total_degree = self_degree + rest_degree;

        let self_score = scores[node as usize];

        for target in graph.out_neighbors_with_values(node) {
            if target.target == node {
                continue;
            }
            new_scores[target.target as usize] +=
                self_score * target.value as f32 / total_degree as f32;
        }
        new_scores[node as usize] += self_score * self_degree as f32 / total_degree as f32;
    }

    *scores = new_scores;
}

pub fn page_rank(graph: &DirectedCsrGraph<i32, (), i32>) -> Vec<f32> {
    // https://docs.rs/graph/latest/src/graph/page_rank.rs.html#1-198
    let node_count = graph.node_count();
    let init_score = 1_f32;

    let mut max_out_degree: i32 = 0;

    let mut out_degrees = vec![0; node_count as usize];

    for node in 0..node_count {
        let out_degree = graph
            .out_neighbors_with_values(node)
            .fold(0, |acc, x| acc + x.value);
        max_out_degree = max_out_degree.max(out_degree);

        out_degrees[node as usize] = out_degree;
    }

    let mut scores = vec![init_score; node_count as usize];
    
    // Run exactly 100 iterations
    for _ in 0..100 {
        page_rank_iteration(graph, &mut scores, &out_degrees, max_out_degree);
    }

    scores
}