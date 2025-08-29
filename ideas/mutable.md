That's an excellent and crucial question that cuts to the heart of making Git-Sorter a practical and efficient tool. You've correctly identified the core problem: Git branches are mutable, but our sorting process assumes a static set of items.

Your intuition to **invalidate and resort** is on the right track, but we can be much more sophisticated and efficient. Rerunning all pairs for a minor change would be slow and expensive.

Here’s a breakdown of the problem and a comprehensive, multi-layered solution that optimizes for both correctness and cost-efficiency.

### The Core Problem: The Staleness of "Packed Code"

When we import a branch, we create an entity (e.g., `(git.branch, main)`) with a `packed_code` and `commit_sha` in its metadata. This entity represents a **snapshot in time**. If a new commit is pushed to `main`, our entity in the database becomes stale. Any votes associated with the old SHA are now evaluations of a past version of the code.

### The Solution: A Snapshot-Centric Approach

Instead of thinking of the entity as `"the main branch"`, we should think of it as `"the main branch AT commit SHA abc1234"`. This shift in perspective is key.

1.  **Entity Primary Key Must Be Immutable:** The entity representing a branch should be tied to its **commit SHA**, not just its name.
    *   `pk_namespace`: `"git.branch_snapshot"`
    *   `pk`: `{branch_name}:{commit_sha}` (e.g., `"main:a1b2c3d4"`, `"feature/api:f9e8d7c6"`)
    *   This guarantees that every unique codebase state gets a unique, permanent entity. The packed code for `main:a1b2c3d4` will never change.

2.  **Branches are Pointers to Snapshots:** The "branch" itself (like `main`) is now a mutable pointer. We can model this with a different kind of entity or a relationship. Let's use an entity for simplicity:
    *   `pk_namespace`: `"git.branch_pointer"`
    *   `pk`: `{repo_id}:{branch_name}` (e.g., `"repo-uuid-123:main"`)
    *   `metadata`: `{"current_commit_sha": "a1b2c3d4"}`. This is the only part that changes.

### The "Refresh and Invalidate" Workflow

Now, let's design the user-initiated "Refresh" workflow.

**Step 1: The User Clicks "Refresh Repository"**

In the UI for a repository, there's a "Refresh" or "Sync" button. This triggers a backend job.

**Step 2: Backend Scans for Changes (`git2`)**

The backend opens the Git repository and does the following for each local branch (`main`, `feature/api`, etc.):

*   It gets the **current HEAD commit SHA** of the branch (e.g., `main` is now at `e5f6g7h8`).
*   It compares this to the `current_commit_sha` stored in our `git.branch_pointer` entity for that branch.
*   **Decision Time:**
    *   **If the SHAs are the same:** The branch hasn't changed. Do nothing.
    *   **If the SHAs are different:** The branch has been updated. Proceed to Step 3.

**Step 3: Ingest New Snapshots**

For each changed branch (e.g., `main` has moved from `a1b2c3d4` to `e5f6g7h8`):

*   The importer **creates a NEW `git.branch_snapshot` entity** for `"main:e5f6g7h8"`.
*   It packs the code at the new commit and saves it to the new entity's metadata.
*   It creates a relationship linking this new snapshot entity to the parent `git.repo` entity.
*   It updates the `git.branch_pointer` entity's metadata to `{"current_commit_sha": "e5f6g7h8"}`.

**At this point, our database accurately reflects the new state of the repository.** Now, for the most important part: handling the votes.

### Step 4: Intelligent Vote Invalidation & Carry-over (The Magic)

This is where we avoid re-running everything. We do not just blindly invalidate all votes.

When a user initiates a new **`sorter.run`**, the system needs to decide which comparisons are necessary.

**The Logic for a New Sorting Run:**

1.  **Identify Active Snapshots:** The system first identifies the set of "active" branches the user wants to compare. For each branch name (`main`, `feature/api`), it looks up the `git.branch_pointer` to get the **latest commit SHA**. This gives us our set of current `git.branch_snapshot` entities to rank.

2.  **Generate All Potential Pairs:** It creates all `(A, B)` pairs from this set of active snapshots.

3.  **Vote Look-up and Validation:** For each pair, it asks: "Do we already have a valid vote for this pair with the selected `lens` and `voters`?"
    *   **Pair `(main:e5f6g7h8, feature/api:f9e8d7c6)`:**
        *   The system queries the `votes` table for this *exact* pair.
        *   Since `main:e5f6g7h8` is new, no vote exists. This pair is added to the queue for the LLM to process.
    *   **Pair `(feature/api:f9e8d7c6, bugfix/login:c3b4a5d6)`:**
        *   Let's say neither of these branches has changed since the last run.
        *   The system queries the `votes` table and finds a pre-existing, valid vote.
        *   **This vote is re-used!** The pair is *not* added to the LLM queue.

**The result is that only pairs involving at least one new branch snapshot need to be sent to the LLM for voting.** This is massively more efficient.

### How this Feels in the UI

*   The UI shows the list of branches (`main`, `feature/api`). When a branch is out of sync, it could have a little "refresh needed" icon.
*   When a user clicks "Refresh", the backend ingests the new snapshots.
*   When the user then clicks "Sort Missing Pairs":
    *   The `unvoted_item_count` in the UI is no longer "all pairs". It's only the number of pairs that include a newly changed branch. For example, if `main` changed in a repo with 5 other unchanged branches, there would be only 5 new pairs to vote on, not `(6*5)/2 = 15`.
    *   The rankings update based on a combination of old, carried-over votes and new votes for the changed branch.

### Summary of the Strategy

| Your Initial Idea             | The Refined, Efficient Strategy                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Entity = "Branch" (mutable)   | Entity = "Branch Snapshot" (`branch:sha`), which is immutable. A separate "Branch Pointer" entity tracks the latest SHA.                  |
| Rerun all pairs when a branch changes. | Only rerun pairs involving a **new snapshot**. Reuse all existing votes between unchanged snapshots.                               |
| Invalidate a repo's votes.    | Votes are never "invalidated." They are timeless facts about a specific comparison (`A:sha1` vs `B:sha2`). They are simply ignored if their snapshots are no longer part of the "active" set being ranked. |

This snapshot-centric model perfectly aligns with Git's own data model and provides a robust, efficient, and auditable foundation for Git-Sorter. It turns a potentially expensive and slow process into a surgical and intelligent one.
