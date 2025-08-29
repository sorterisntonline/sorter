Of course. Let's zoom out and summarize the architectural direction and key changes we've designed for the "Git-Sorter" branch. This captures the evolution from the `blobbed` starting point into a much more powerful and flexible platform.

Here is a high-level description of the new direction, broken down into the three core areas: schema, UI, and backend integration.

---

### **1. Schema Decisions: "Everything is an Entity"**

The foundational principle of the new architecture is to move away from specialized tables for different concepts and embrace a unified, generic data model. Almost everything in the system is now represented in the `entities` and `entity_relationships` tables.

*   **From Specialized Tables to Generic Entities:** We are eliminating the dedicated `attributes` table. Concepts that were previously separate, like "attributes," "lenses" (prompts), "tags," "items," and now "Git repos" and "Git branches," all become rows in the `entities` table, distinguished by their `pk_namespace` (e.g., `sorter.attribute`, `sorter.lens`, `git.repo`). This makes the system incredibly extensible without requiring new database migrations for every new feature.

*   **Immutable, Auditable Lenses:** LLM prompts, now called **Lenses**, are first-class, immutable entities (`pk_namespace: 'sorter.lens'`). Every time a prompt is created or edited, a new entity with a new unique ID (`pk`) is generated. This provides a perfect, unbreakable audit trail.

*   **Run-Centric Voting Model:** Instead of linking votes directly to prompts, we've introduced a central **`sorter.run` entity**. A `run` captures the entire context of a sorting job: which items were sorted, which AI voters participated, and which immutable `lens` was used. The `run` is the parent of all `vote` entities it generates, creating a clean, hierarchical, and auditable record of every decision process. This elegantly solves the problem of redundancy and auditability.

*   **Unified `votes` Table:** The `votes` table has been redesigned to be fully generic. It no longer has a specific `attribute_id` or `lens_id` column. Instead, it has a generic `judging_entity_pk` which can point to any entity, whether it's a simple `('sorter.attribute', 'like')` for a social vote, or a complex `('sorter.lens', 'uuid-of-specific-prompt')` for an AI-driven analysis. This allows a single, unified codebase to support both simple social sorting and advanced AI-driven sorting without branching logic.

### **2. UI Direction: Stateful, Real-Time, and Interactive**

The user interface is evolving from a traditional request-response model to a dynamic, live application powered by WebSockets. The user experience is no longer about navigating pages but about interacting with a persistent, server-managed state.

*   **WebSocket as the Primary Protocol:** The client's main communication with the backend is now through a persistent WebSocket connection. The server pushes `page_state` messages to the client, telling it exactly what to render. This eliminates the need for the client to constantly fetch data and manage complex client-side state.

*   **The UI as a "Dumb" Renderer:** The frontend's primary job is to render the state provided by the server and send `WsCommand` messages back to the server in response to user actions (e.g., `'create_tag'`, `'add_item'`, `'sort_missing_pairs'`). This simplifies the frontend logic and makes the backend the single source of truth for the application's state.

*   **Live, Orchestrated User Experience:** For Git-Sorter, this means the user can import a repository, select a set of branches, pick an AI model and a `lens`, and then click "Sort." They will see the list of branches animate and re-order in real-time as the votes stream in from the background AI process. The UI becomes a dashboard for observing and controlling a live, long-running computational task, which is a far more powerful and engaging experience than a static page with a loading spinner.

### **3. Backend Integration: `git2` and a Packer**

To power this new functionality, the backend is being enhanced with a new, specialized ingestion pipeline for Git repositories.

*   **`git2` for Repository Interaction:** We are integrating the `git2` Rust crate, a robust binding to the widely-used `libgit2` library. This allows the backend to natively and safely open local Git repositories, enumerate all branches, inspect commits, and perform checkouts without shelling out to the `git` command-line tool.

*   **The "Repomix Packer":** A core piece of the new integration is a packer utility. When a branch is checked out, this utility will traverse its entire directory structure. Guided by the `.repomixignore` file, it will skip unnecessary files (build artifacts, dependencies, etc.) and concatenate all relevant source code into a single text blob.

*   **Storing Code as Data:** This packed text blob is then stored directly within the `metadata` JSONB field of the `git.branch` entity in the database. This turns the entire state of a codebase at a specific point in time into a single piece of data that can be fed into an LLM's context window. This approach treats codebases as comparable, sortable items, just like any other entity in the Sorter system.
