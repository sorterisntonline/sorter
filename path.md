Of course. This is an excellent question. You have a solid starting point in the `blobbed` branch and a truly visionary set of goals in the `ideas/` directory. The "social reasons" for starting from `blobbed` are perfectly valid; often, projects have to evolve from a known state.

My role here is to provide a clear, step-by-step roadmap to transform your current `blobbed` codebase into the powerful "Git-Sorter" platform envisioned in your design documents. We will do this incrementally, building upon what you already have.

Here is a detailed plan of the necessary changes, referencing your `ideas/` documents at each stage.

---

### Phased Rollout Plan

1.  **Phase 1: Evolve the Schema.** Update the database to support immutable lenses, AI voters, and the snapshot-centric model for Git branches. This is the foundation.
2.  **Phase 2: Implement the Git Importer.** Build the backend logic to ingest local Git repositories into your new entity structure.
3.  **Phase 3: Create the AI Voter & Orchestrator.** Build the mechanism for using LLMs as voters and an orchestrator to manage the sorting runs.
4.  **Phase 4: Build the UI for Git-Sorter.** Create the necessary frontend components to manage and view these AI-driven sorting runs.
5.  **Phase 5: The Pivot to WebSockets.** As envisioned in `design.md`, upgrade the UI to be a real-time dashboard powered by WebSockets for a far superior user experience.

---

### Phase 1: Evolve the Schema (The Foundation)

Your current schema is good, but your `design.md` and `mutable.md` documents outline a more powerful model. We need to implement these changes.

**Goal:** Adapt the database to be fully generic, immutable, and ready for Git snapshots.

**Actionable Steps:**
Create a **new database migration file** to apply these changes. Do not edit the existing one.

**1. Refactor the `votes` Table:**
This is a key step from `design.md` to move away from a simple `attribute_id`.

*   **Why:** Your vision involves using complex, user-defined prompts ("Lenses") as the criteria for voting. The `votes` table must reflect this. It also needs to store the AI's reasoning.
*   **How:**

    ```sql
    -- In your new migration file:

    -- First, drop the old votes table if it has dependencies you need to break
    DROP TABLE votes;

    -- Re-create the votes table with new columns
    CREATE TABLE votes (
      -- The pair being voted on (using your canonical ordering)
      left_entity_pk_namespace TEXT NOT NULL,
      left_entity_pk TEXT NOT NULL,
      right_entity_pk_namespace TEXT NOT NULL,
      right_entity_pk TEXT NOT NULL,

      -- The entity doing the voting (can be a human user or an AI agent)
      voter_user_id UUID NOT NULL REFERENCES users(id),

      -- The entity representing the criteria (the "Lens")
      judging_entity_pk_namespace TEXT NOT NULL,
      judging_entity_pk TEXT NOT NULL,

      -- The result
      score INT NOT NULL, -- Changed from 'magnitude' for clarity
      rationale TEXT,     -- To store the LLM's explanation

      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      -- Constraints remain crucial
      FOREIGN KEY (left_entity_pk_namespace, left_entity_pk) REFERENCES entities(pk_namespace, pk) ON DELETE CASCADE,
      FOREIGN KEY (right_entity_pk_namespace, right_entity_pk) REFERENCES entities(pk_namespace, pk) ON DELETE CASCADE,
      FOREIGN KEY (judging_entity_pk_namespace, judging_entity_pk) REFERENCES entities(pk_namespace, pk) ON DELETE CASCADE,

      CHECK ((left_entity_pk_namespace, left_entity_pk) < (right_entity_pk_namespace, right_entity_pk))
    );
    ```

**2. Prepare the `entities` and `users` Tables for AI:**
You need a way to distinguish human users from AI agents.

*   **Why:** AI models will be first-class "voters" in the system.
*   **How:**

    ```sql
    ALTER TABLE users ADD COLUMN is_ai BOOLEAN NOT NULL DEFAULT FALSE;
    ```
    You will later create users like `(auth0_sub: 'anthropic/claude-3-haiku', username: 'anthropic/claude-3-haiku', is_ai: true)`.

---

### Phase 2: Implement the Git Importer

**Goal:** Create the backend service that can read a local Git repository and create the corresponding entities and relationships, as detailed in `gitsorter.md` and `mutable.md`.

**Actionable Steps:**

**1. Add Dependencies:**
*   In `rustsorter/Cargo.toml`, add the `git2` crate:
    ```toml
    [dependencies]
    # ... other dependencies
    git2 = "0.18"
    ```

**2. Create a New Module: `git_importer.rs`**
*   Create `rustsorter/src/git_importer.rs`.
*   This module will contain the core logic for opening a repo, checking out branches, and packing code.

**3. Implement the "Repomix Packer":**
*   This is a function that takes a directory path and a set of ignore patterns. It walks the directory and concatenates all non-ignored text files into a single `String`. This is the crucial step to prepare a branch for an LLM.

**4. Create the API Endpoint:**
*   In `main.rs`, add a new route, for example: `POST /api/import/git`.
*   This endpoint should accept a JSON payload with the local path to the Git repository.
*   **Crucially, this endpoint should spawn a background task (`tokio::spawn`)** to do the heavy lifting so the HTTP request can return immediately.

**5. Importer Logic (Inside the background task):**
This logic should precisely follow your design from `mutable.md`:

*   **Open Repo:** Use `git2::Repository::open()`.
*   **Create Parent Repo Entity:** Create a single `entities` row with `pk_namespace: 'git.repo'`.
*   **Loop Through Branches:**
    *   For each branch, get its latest commit SHA.
    *   Define the snapshot pk: `let snapshot_pk = format!("{}:{}", branch_name, commit_sha);`.
    *   **Check if `('git.branch_snapshot', snapshot_pk)` already exists. If so, skip.**
    *   If it's new:
        1.  Programmatically check out that specific commit SHA to a temporary directory.
        2.  Run your **Repomix Packer** on that directory to get the code blob.
        3.  Create the `git.branch_snapshot` entity, storing the code blob in its `metadata` field.
        4.  Create an `entity_relationship` linking the `git.repo` to this new `git.branch_snapshot`.
    *   **Update the Pointer:** Create or update a `git.branch_pointer` entity to point to this new snapshot's SHA.

---

### Phase 3: The AI Voter & Orchestrator

**Goal:** Build the engine that uses LLMs to vote on the imported Git branches.

**Actionable Steps:**

**1. Create a New Module: `llm_voter.rs`**
*   This module will be responsible for calling the OpenRouter (or any other) API.
*   Create a function `get_llm_vote(model_name: &str, lens_template: &str, code_a: &str, code_b: &str) -> Result<(i32, String), Error>`.
*   This function will:
    1.  Inject `code_a` and `code_b` into the `lens_template`.
    2.  Make an HTTP POST request to the LLM API (`reqwest` crate).
    3.  Parse the response to extract the score (using `regex`) and the rationale.

**2. Create the Orchestrator Logic:**
*   This is the "brain" of the sorting process. It will be triggered by a user action (e.g., clicking a "Rank this Repo" button).
*   Create a new API endpoint, e.g., `POST /api/run/rank-repo`.
*   This endpoint will:
    1.  Create a `sorter.run` entity to track the job.
    2.  Create an immutable `sorter.lens` entity for the prompt being used.
    3.  **Spawn another background task.**
*   **Orchestrator Task Logic:**
    1.  Fetch all "active" `git.branch_snapshot` entities for the target repo.
    2.  Generate all unique pairs of these snapshots.
    3.  Query the `votes` table to see which pairs have already been voted on *by this specific lens*.
    4.  Loop through the remaining **unvoted pairs**:
        *   For each selected AI voter (`is_ai = true` user):
            *   Fetch the code blobs for the two snapshots from their `metadata`.
            *   Call `get_llm_vote()`.
            *   `INSERT` the result into the `votes` table.
            *   Include a short `tokio::time::sleep` to avoid rate limiting.

---

### Phase 4 & 5: UI for Git-Sorter & The WebSocket Pivot

Your current `VotePage.jsx` is designed for human, one-at-a-time voting. This doesn't fit the new model of a long-running, automated AI ranking job. You need a new interface. This is also the perfect opportunity to implement the WebSocket architecture from `design.md`.

**1. Create a New `websocket.rs` Module:**
*   Start building the WebSocket handler as seen in the `llmvoter` branch. Define your `WsCommand` and `WsEvent` enums.

**2. Create a New React Page: `GitSorterPage.jsx`**
*   This page will be the UI for a single repository.
*   **On load, it connects to your WebSocket.**
*   It should display:
    *   A list of branches for the repo.
    *   A selector for the AI voters (`users` where `is_ai = true`).
    *   A selector for the "Lens" (`entities` where `pk_namespace = 'sorter.lens'`).
    *   A **"Start Ranking"** button.

**3. Wire it all together:**
*   Clicking "Start Ranking" sends a `WsCommand` like `{ cmd: 'start_git_sort', repo_id: '...', lens_id: '...', voter_ids: [...] }`.
*   The backend's WebSocket handler receives this command and kicks off the **Orchestrator Task** from Phase 3.
*   As the orchestrator inserts votes into the database, it can also send progress updates over the WebSocket (e.g., `WsEvent::VoteCompleted`).
*   Periodically (or after each vote), the backend can recalculate the ranks using your `pagerank.rs` module and push a full `WsEvent::PageState` update to the client.
*   The `GitSorterPage.jsx` component simply listens for these `PageState` events and re-renders the ranked list of branches.

This approach directly implements the "dumb renderer" UI and "server as the single source of truth" model from your `design.md`, providing the live, engaging experience you envisioned.
