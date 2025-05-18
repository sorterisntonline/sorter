what about this: maybe each 5 songs is a set. after you have that ranked . call it 7 votes, you submit it to the masterlist. it submits by an animation of it flying up towards the screen. it submits it to the master list, and it runs the ranking on it, then sends you a list of changed places in the graph. you caused [kid a - idioteque] to drop 3  spots. then you build your next 5 songs. it splits up the monotony of voting, gives sense of progress/finality. and gives the reward in an obvious and possible to implement way: the ranking diff result. 

That's a clever refinement! Breaking the sorting into smaller, distinct "sets" (e.g., 5 songs) with a clear submission and feedback step introduces several interesting UX benefits that address some potential drawbacks:

**The "5-Song Set" Flow:**

1.  **Fetch Recent:** App still gets the latest (e.g., 10 unique) recent plays.
2.  **Isolate Set:** It presents the *first 5* unranked songs from that list (or a newly fetched set if all recent are done).
3.  **Focused Sort:** User performs pairwise comparisons *only within that set of 5*. This requires a fixed number of comparisons (likely less than comparing all 10 at once, maybe around 7-10 comparisons depending on the pairing algorithm).
4.  **"Submit Set" Action:** Once all necessary pairs within the set are compared, the user explicitly hits a "Submit" or "Finalize Set" button.
5.  **Animation:** A rewarding visual animation plays (e.g., the set "flying" off).
6.  **Backend Processing:**
    *   The votes for *that set* are sent to the backend.
    *   Backend records the votes.
    *   Backend **recalculates the user's *overall* ranking** based on *all* their historical votes (including the newly submitted ones). It could potentially also update a global rank, but let's focus on personal rank first for simplicity.
7.  **Immediate Feedback (The Reward):**
    *   Backend determines which songs (in the user's *overall* known/ranked list) changed positions *due to this submission*.
    *   It sends back a concise "Ranking Change Report": e.g., "`[Track A]` up 2 spots!", "`[Track B]` down 1 spot", "`[Track C]` entered your top 20!".
8.  **Next Set:** The UI automatically presents the *next* set of 5 unranked songs from the recently played list (or indicates completion if all done).

**Advantages of this Batching Approach:**

1.  **Reduced Monotony:** Instead of a potentially long, indefinite sorting session, it creates shorter, focused bursts of activity. This feels less daunting.
2.  **Clear Progress & Finality:** Submitting a "set" provides a distinct sense of accomplishment and closure for each mini-session. It makes progress tangible.
3.  **Well-Defined Reward:** The "Ranking Change Report" is a **perfectly viable and implementable V1 reward**.
    *   It's directly linked to the user's action.
    *   It leverages the existing ranking logic (`pagerank.rs`).
    *   It gives immediate, meaningful feedback on the impact of their votes *on their own preference graph*.
    *   It's easily displayable in the UI.
4.  **Manages Comparison Load:** Ensures the user only needs to make a manageable number of comparisons per "sitting". Comparing all pairs in a set of 10 can be ~45 comparisons, while a set of 5 is only ~10. (Exact number depends on if you require full pairwise comparison or use a more efficient sorting network approach).
5.  **Creates Mini-Loops:** Completing a set and seeing the changes provides a micro-reward loop within the larger session, encouraging the user to start the next set.

**Implementation Considerations:**

*   **Pairing Algorithm:** Within the set of 5, how are pairs chosen? Randomly? Least-compared? A specific sequence to guarantee a full ranking? This needs definition.
*   **State Management (Frontend):** Need to track which songs are in the current set, which pairs have been compared, and when the set is "complete".
*   **Backend Rank Calculation:** Triggering a full re-rank on every 5-song submission might be computationally expensive as the user's history grows. Optimization might be needed later (e.g., incremental updates, background processing for global ranks). But for *personal* rank feedback, it's likely feasible initially.
*   **"Ranking Change Report" Generation:** Backend needs logic to compare the user's ranking *before* and *after* processing the new set's votes to identify changes. Store the previous ranking temporarily or query efficiently.
*   **Handling Edges:** What happens if there are fewer than 5 unranked recent songs left? Present a smaller set?

**Alignment with Goals:**

*   **Simplicity:** Yes, keeps the core interaction simple ("sort these few items").
*   **Sticky:** Yes, the batching, clear progress, and immediate feedback loop make it potentially more engaging and less tedious than continuous sorting.
*   **Viral:** The "Ranking Change Report" itself might not be as inherently shareable as a Wordle grid, but seeing your ranking change could motivate users to keep sorting and eventually share their overall profile/top list (a V1.5 reward).

**Conclusion:**

This "5-Song Set Submission" approach is a **significant improvement** on the continuous sorting idea.

*   It directly addresses the potential monotony of endless pairwise comparisons.
*   It introduces clear breakpoints and a sense of progress.
*   Most importantly, it provides a **concrete, implementable, and meaningful immediate reward** (the Ranking Change Report) that leverages your existing ranking infrastructure.

This makes the core loop much stronger and feels more like a polished "game" mechanic. It's a very promising iteration towards the simple, sticky, addictive goal.
