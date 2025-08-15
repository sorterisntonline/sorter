Excellent. This is the most critical design step. Let's architect the PStates for your "Sorter" platform, keeping your core concepts in mind:

*   **Portable Votes:** A vote is about two items, independent of context.
*   **"DNS for Tags":** Mutable slugs point to immutable, curated collections.
*   **Faceted Search:** Items can have descriptive tags for filtering.
*   **Ranking Engine:** The system must compute and store scores.

We will design the PStates to be the **pre-computed answers** to the questions your application will ask. This will make your backend query logic incredibly simple and fast.

---

### The Core PState Design

We'll organize the PStates into four logical groups: **Core Entities**, the **Curation Layer**, the **Ranking Engine**, and the **Discovery Layer**.

#### 1. Core Entity PStates (The Foundational Objects)

These PStates store the raw information about the fundamental objects in your system.

**`$$users_by_id`**
*   **Purpose:** Stores the complete profile for each user, queryable by their permanent UUID.
*   **Schema:** `Map<java.util.UUID, UserProfileObject>`
    *   `UserProfileObject` would be a record containing `:username`, `:avatar_url`, `:bio`, etc.
*   **Partitioning:** By `user-id`. All data for a single user is co-located on one task.

**`$$username->id`**
*   **Purpose:** A secondary index to enforce username uniqueness and allow lookups by username.
*   **Schema:** `Map<String, java.util.UUID>`
*   **Partitioning:** By `username`.

**`$$items_by_id`**
*   **Purpose:** Stores the canonical data for every unique item that can be ranked. This is the "statement is the item" concept.
*   **Schema:** `Map<java.util.UUID, ItemObject>`
    *   `ItemObject` would be a record containing the core content, e.g., `:type` (`:url`, `:statement`), `:content` ("Elon Musk is a visionary"), `:metadata` (source URL, etc.), and `:creator_id`.
*   **Partitioning:** By `item-id`.

---

#### 2. Curation Layer PStates (The "DNS for Tags" Implementation)

These PStates model the relationship between human-readable slugs and the specific, curated collections of items.

**`$$collections_by_id`**
*   **Purpose:** Stores the definition of each curated collection. This is the "immutable commit SHA" of your system.
*   **Schema:** `Map<java.util.UUID, CollectionObject>`
    *   `CollectionObject` would be a record containing `:name`, `:description`, `:owner_id`, and crucially:
    *   **`:members` -> `Set<java.util.UUID>` (the item IDs). This set MUST be subindexed.**
*   **Partitioning:** By `collection-id`.
*   **Why this is powerful:** A collection can contain millions of items, but because the `members` set is subindexed, you can add, remove, or check for a single item efficiently without ever loading the entire set.

**`$$slugs`**
*   **Purpose:** The mutable pointer. It maps a human-readable slug (e.g., `#jedi`) to a specific, immutable collection UUID. This is the "DNS record."
*   **Schema:** `Map<String, java.util.UUID>`
*   **Partitioning:** By `slug`.

**`$$item->collections` (Denormalized View)**
*   **Purpose:** A reverse index to instantly answer "What collections is this item a member of?". This is critical for UI context and discovery.
*   **Schema:** `Map<java.util.UUID, Set<java.util.UUID>>` (Item ID -> Set of Collection IDs)
    *   The inner `Set` should be subindexed.
*   **Partitioning:** By `item-id`.

---

#### 3. Ranking Engine PStates (The Heart of the System)

This is where the magic happens. We don't store raw votes in a queryable PState; we store the **computed results** of those votes.

**`$$item_scores`**
*   **Purpose:** This is the primary data structure for the ranking engine. It stores the computed score for every item *within the context of a specific collection*. An item's score can be different in different collections because its set of competitors changes.
*   **Schema:** `Map<java.util.UUID, Map<java.util.UUID, ScoreObject>>`
    *   Outer Key: `collection-id`
    *   Inner Key: `item-id`
    *   Value: `ScoreObject` (a record with `:elo`, `:variance`, `:vote_count`, etc.)
    *   **Both the outer and inner maps must be subindexed.**
*   **Partitioning:** By `collection-id`. This is a critical choice. It ensures that all scores for a single leaderboard are stored on the same physical task, making leaderboard generation extremely fast.
*   **How it works:** When a `Vote` event arrives, the ranking topology looks up the two items involved. It finds all the collections they share (using `$$item->collections`). For each shared collection, it partitions to that collection's task, reads the two current `ScoreObject`s, runs the ranking algorithm, and writes the two new `ScoreObject`s back.

**`$$leaderboards` (Optional Optimization)**
*   **Purpose:** For extremely popular collections, you can pre-compute and store the fully sorted leaderboard to make reads even faster.
*   **Schema:** `Map<java.util.UUID, Vector<[java.util.UUID, Double]>>` (Collection ID -> Sorted list of `[ItemID, Score]`)
*   **Partitioning:** By `collection-id`.
*   **How it works:** The ranking topology could update this PState periodically (e.g., every 100 votes) or in a separate, slower microbatch topology.

---

#### 4. Discovery Layer PStates (Faceted Search)

This PState enables the powerful `#hiphop #albums #1990s` style queries.

**`$$tag->items`**
*   **Purpose:** An inverted index mapping descriptive tags to the items that have them.
*   **Schema:** `Map<String, Set<java.util.UUID>>` (Tag -> Set of Item IDs)
    *   The inner `Set` must be subindexed.
*   **Partitioning:** By `tag`.
*   **How it works:** To find items matching `#hiphop` AND `#1990s`, your application (or a query topology) would:
    1.  Fetch the set of item IDs for the `#hiphop` key.
    2.  Fetch the set of item IDs for the `#1990s` key.
    3.  Perform a set intersection on these two sets to get the final list of matching item IDs.

### How This Design Simplifies Your Application

Let's revisit the "Before vs. After" for your Rust backend, which now becomes a thin API gateway to Rama.

| Task | Before (SQL + Rust) | After (Rama + Rust) |
| :--- | :--- | :--- |
| **Get Leaderboard for `#jedi`** | 1. `SELECT collection_id FROM slugs WHERE slug = '#jedi'`. <br> 2. `SELECT child_id FROM relationships WHERE parent_id = ?`. <br> 3. `SELECT * FROM votes WHERE left_id IN (...) AND right_id IN (...)`. <br> 4. Load millions of votes into Rust. <br> 5. Build graph in memory. <br> 6. Run PageRank/Elo algorithm. <br> 7. Sort results. | 1. `foreign-select-one (keypath "#jedi") $$slugs` to get the collection ID. <br> 2. Invoke a `get-leaderboard` query topology with the collection ID. This query reads the pre-sorted list from `$$leaderboards` or sorts the pre-computed scores from `$$item_scores`. The entire computation happens inside Rama in milliseconds. |
| **Fork a Collection** | Requires a complex transaction to copy potentially millions of `entity_relationships` rows. Then you have to decide how to handle votes—do you copy them? This is a nightmare. | A user appends a `ForkCollection` event. The topology: <br> 1. Reads the member set from `$$collections_by_id`. <br> 2. Creates a new collection UUID. <br> 3. Writes a new entry to `$$collections_by_id` with the copied member set. <br> **Crucially, no votes need to be copied.** The new collection instantly inherits the entire global voting history of its members. |
| **Faceted Search** | A complex `JOIN` across `items`, `item_tags`, and `tags` tables, likely with `GROUP BY` and `HAVING COUNT(...)` clauses to find intersections. Very slow at scale. | Fetch two or more sets from `$$tag->items` and perform a fast set intersection in your application or a query topology. |

By using PStates, you move the computational complexity from your application's read path into Rama's write path. Your Rust code stops being a complex data transformation and computation engine and becomes a simple orchestrator of queries against pre-computed, perfectly shaped data structures. **This is the key to building a system with the ambition of Sorter.**
