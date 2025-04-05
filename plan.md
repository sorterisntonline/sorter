
Okay, here is a summary plan incorporating the ideas we've discussed, emphasizing the key design decisions:

**Overall Goal:**

To create a system centered around a multi-tag selector UI (`App.jsx`) that allows users to select and combine both abstract Sorter tags (e.g., `#songs`, `#hiphop`, `#2010s`) and specific Spotify entities (tracks, albums, artists). The system should allow exploring individual items and performing intersection-based queries by combining tags.

**1. Database Foundation (Schema: `20250331210657_entity.up.sql`)**

*   Utilize the flexible `entities` table with its composite primary key `(pk_namespace, pk)` to represent *both* Sorter tags (`pk_namespace='sorter.tag', pk='hiphop'`) and Spotify entities (`pk_namespace='spotify.album', pk='<spotify_id>'`). Store names/titles and relevant `metadata` (like image URLs).
*   Use the `entity_relationships` table to define parent/child links between any two entities (e.g., linking a `spotify.track` to `sorter.tag`='songs', or a `spotify.track` to a `spotify.album`).

**2. Core Interaction Model: Dual-Mode Selection (Key Design Decision)**

*   **Single Entity Selected (`selectedTags.length === 1`):**
    *   **Purpose:** Exploration and Detail View.
    *   **Behavior:** The UI should display detailed information about the selected entity (fetched from the `entities` table) *and* its immediate parent and child relationships (fetched via the `entity_relationships` table).
*   **Multiple Entities Selected (`selectedTags.length > 1`):**
    *   **Purpose:** Querying and Filtering via Intersection (AND semantics).
    *   **Behavior:** The UI should display the set of entities that are children of *all* the selected entities. This requires a backend query that finds the intersection based on the `entity_relationships` table (likely using `GROUP BY child_pk_namespace, child_pk HAVING COUNT(...) = <number_of_selected_tags>`).

**3. Data Integration: Lazy Import for Spotify Entities (Key Design Decision)**

*   **Problem:** Avoid importing the entire Spotify catalog upfront.
*   **Solution:** Implement a "just-in-time" import mechanism.
*   **Trigger:** When a user selects a *single* Spotify entity (track, album, artist) for the first time, making `selectedTags.length === 1` with that Spotify item.
*   **Action:** The frontend triggers a backend call (`/api/entity/ensure`?) to `INSERT` the basic details (namespace, pk, title, minimal metadata like image URL) of that Spotify entity into the local `entities` table using `ON CONFLICT (pk_namespace, pk) DO NOTHING` to ensure idempotency.

**4. Backend Implementation (API Endpoints)**

*   **Unified Search (`/api/search` or similar):**
    *   Accepts a query string.
    *   Queries both the Spotify API (proxied?) and the local `entities` table for matching `sorter.tag` entries.
    *   Merges, ranks (if desired), and returns a combined list of suggestions suitable for the frontend dropdown.
*   **Single Entity Details (`/api/entity/details` or similar):**
    *   Accepts `pk_namespace` and `pk`.
    *   Fetches the entity's data from `entities`.
    *   Fetches its parent and child relationships from `entity_relationships`.
    *   Returns the combined details.
*   **Multi-Entity Intersection Query (`/api/entity/query/intersection` or similar):**
    *   Accepts a list of selected `(pk_namespace, pk)` pairs.
    *   Performs the intersection SQL query against `entity_relationships`.
    *   Fetches details for the resulting entities from the `entities` table.
    *   Returns the list of resulting entities.
*   **Ensure Entity (`/api/entity/ensure` or similar):**
    *   Accepts entity details (`pk_namespace`, `pk`, `title`, `metadata`).
    *   Performs the `INSERT ... ON CONFLICT DO NOTHING` operation into the `entities` table.

**5. Frontend Implementation (`App.jsx` and related components)**

*   Update `selectedTags` state structure to store `{ pk_namespace, pk, name, type, imageUrl, ... }`.
*   Modify `fetchSuggestions` to call the new unified search endpoint.
*   Update rendering logic (`renderSuggestionDetails`, tag rendering, key generation) to handle both Sorter tags and Spotify entities using `pk_namespace` and `pk`.
*   Implement a `useEffect` hook watching `selectedTags`.
    *   If `selectedTags.length === 1`:
        *   Check if it's a Spotify entity not yet imported; if so, call `/api/entity/ensure`.
        *   Call `/api/entity/details` to fetch details and relationships.
        *   Update state to display the single-entity view.
    *   If `selectedTags.length > 1`:
        *   Call `/api/entity/query/intersection`.
        *   Update state to display the intersection results list.
    *   If `selectedTags.length === 0`: Clear results display.
*   Conditionally render the appropriate view (single entity details + relationships OR intersection results list) based on the fetched data.

This plan leverages the flexible database schema with distinct UI modes based on selection count and incorporates an efficient lazy-import strategy for external data.
