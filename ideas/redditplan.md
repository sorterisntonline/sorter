Of course. Let's design the user experience for the Reddit integration, keeping the "no background jobs for now" constraint front and center. This constraint means we need to be very clear with the user about what's happening when they initiate a synchronous, potentially long-running import.

We'll break this down into the two primary use cases you outlined.

---

### Use Case A: Sorting an Entire Subreddit

**Goal:** To find the best posts within a subreddit over a specific timeframe or to discover old gems.
**Canonical URL:** `sorter.social/r/{subreddit_name}` (e.g., `sorter.social/r/AmItheAsshole`)

#### A1. The First-Time Import (Cold Start)

This is the "Summoning" flow. It's a critical first impression that needs to be clear, powerful, and grant the user control.

**User Flow:**

1.  **Navigation:** User types `sorter.social/r/AmItheAsshole` into their browser and hits Enter.
2.  **The Summoning Gate:** The Sorter backend checks if the entity `('reddit.com.subreddit', 'AmItheAsshole')` exists. It doesn't. Instead of an error or an empty page, the user lands on a dedicated "Summoning" page.

    **UI of the Summoning Page:**
    *   **Headline:** `Summon r/AmItheAsshole`
    *   **Sub-headline:** "This subreddit hasn't been sorted yet. Choose which posts you want to import to begin."
    *   **The Import Form:** A clean, simple form with these options:
        *   **Import Type:** Radio buttons: `[Hot]` `[New]` `(•) Top`
        *   **Timeframe (only shown if "Top" is selected):** Dropdown menu: `[Past 24 Hours]` `[Past Week]` `[Past Month]` `(•) Past Year` `[All Time]`
        *   **Post Limit:** Dropdown menu: `[25 Posts]` `(•) 100 Posts` `[250 Posts]`
    *   **Call to Action Button:** A large, prominent button that says `[Summon Posts and Start Sorting]`.

3.  **The Wait (Synchronous Import):**
    *   User clicks the button.
    *   The entire Summoning Form UI becomes disabled.
    *   The button text changes to a loading state: `[Summoning... this may take a moment]`. A spinner appears.
    *   The user's browser is now waiting for the API response. This is the trade-off for no background jobs.

4.  **The Payoff:**
    *   The backend finishes fetching from Reddit and populating the database.
    *   The API call returns a success status.
    *   The frontend automatically **redirects** the user to the canonical voting URL, which is now populated with content: `sorter.social/vote?ns=reddit.com.subreddit&pk=AmItheAsshole`.
    *   The user is immediately presented with their first pairwise comparison of two posts from the set they just imported. The magic happens.

#### A2. The Refresh (Revisiting a Subreddit)

**User Flow:**

1.  **Navigation:** User goes to `sorter.social/r/AmItheAsshole` a week later.
2.  **Instant Content:** This time, the backend finds the parent entity. The frontend **does not** show the summoning gate. Instead, it immediately redirects to the voting page `sorter.social/vote?ns=...` and the user can start sorting the previously imported posts right away.
3.  **The Desire for New Content:** On this voting page, there needs to be a clear, non-intrusive UI element for adding more posts.
    *   **UI Element:** A button, perhaps in a corner or a header bar, labeled `[+ Fetch More Posts]`.
4.  **The Refresh Modal:**
    *   Clicking the button opens a modal window that contains the *exact same* import form from the A1 Summoning Page (`Import Type`, `Timeframe`, `Limit`).
    *   This is better than navigating away, as it keeps them in the context of the subreddit.
5.  **The Wait & Payoff:**
    *   The user makes their selection in the modal (e.g., "Top" from the "Past Week") and clicks `[Summon Posts]`.
    *   The modal shows the loading state (`[Summoning...]`). The main page content might be grayed out behind it.
    *   The backend adds the new posts. Your `create_entity_ignore_conflict` logic is **critical** here. It will seamlessly add new posts and ignore any duplicates that are already in the database from the previous import.
    *   When the API call completes, the modal closes, and your frontend's TanStack Query cache for that `queryKey` is invalidated. This triggers a fresh fetch of pairs, which now includes the new items mixed in. The user gets a new pair to vote on, potentially including one of the fresh posts.

---

### Use Case B: Sorting a Single, Chaotic Reddit Thread

**Goal:** To find the "truth" or best comments in a specific conversation.

#### B-Option 1: The "Paste-a-Link" Flow

1.  **The Entry Point:** On the Sorter homepage (or in the site header), there's a prominent input field: `[Paste a Reddit thread URL to find the consensus]`.
2.  **The Action:** A user pastes a full Reddit URL and hits Enter or clicks a "Sort" button.
3.  **The API Call:** The frontend takes this URL and immediately calls your importer endpoint for threads.
4.  **The Wait Page:** The user is taken to an interim page that clearly shows what's happening.
    *   **URL:** `sorter.social/importing?url={...}`
    *   **UI:** Shows the title of the Reddit post (which the API should fetch first and fast). A message like: "Summoning all comments from *'{Post Title}'*. This can take several minutes for very large threads." and a prominent loading spinner.
5.  **The Payoff:**
    *   The synchronous API call completes once all comments are ingested and relationships are built.
    *   The frontend redirects to the canonical voting URL for that post's comments: `sorter.social/vote?ns=reddit.com.post&pk={post_id}`.
    *   The user is immediately shown the first pair of comments to sort.

#### B-Option 2: The "Drill-Down" Flow

This flow starts from the Subreddit View (Use Case A).

1.  **The Context:** The user is at `sorter.social/vote?ns=reddit.com.subreddit&pk=AmItheAsshole`, voting on posts.
2.  **The UI Element:** The `VoteItemDisplay` component for each post is now not just for display, it's a gateway. The title of the post is a link.
3.  **The Action (The Drill-Down):** The user clicks the title of a post that looks interesting.
4.  **The Entity Detail Page:** Instead of immediately importing, they are taken to a dedicated page for that entity.
    *   **URL:** `sorter.social/entity/reddit.com.post/{post_id}`
    *   **UI:**
        *   Shows the post's title, author, and metadata (score, body text/image).
        *   Checks if comments have already been imported (i.e., if this post entity has children).
        *   **If not imported:** It shows a big button: `[Sort the Comments in this Thread]`.
        *   **If already imported:** The button says `[Continue Sorting Comments]` and it links directly to `sorter.social/vote?ns=reddit.com.post&pk={post_id}`.
5.  **The Wait & Payoff:**
    *   User clicks `[Sort the Comments in this Thread]`.
    *   The button triggers the same API call and loading state as the paste-a-link flow. Because it's synchronous, the page just waits, showing a spinner on the button.
    *   When the API returns, the page redirects to the vote URL (`.../vote?ns=reddit.com.post&pk={post_id}`), and the user can begin sorting comments.

### Summary of API Endpoints Required:

This UX plan implies two main synchronous importer endpoints:

1.  **`POST /api/importer/reddit/subreddit`**
    *   **Payload:** `{ subreddit: "AmItheAsshole", listing_type: "top", timeframe: "year", limit: 100 }`
    *   **Logic:**
        *   `create_entity_ignore_conflict` for the parent subreddit entity.
        *   Fetch posts from the Reddit API based on payload.
        *   Loop through posts:
            *   `create_entity_ignore_conflict` for each post entity.
            *   `create_relationship_ignore_conflict` linking post to subreddit.
    *   **Returns:** `200 OK` with a summary, like `{ "new_posts_imported": 85 }`.

2.  **`POST /api/importer/reddit/thread`**
    *   **Payload:** `{ thread_url: "https://reddit.com/r/..." }`
    *   **Logic:**
        *   Parse URL to get post ID.
        *   Fetch thread JSON from Reddit API.
        *   `create_entity_ignore_conflict` for the parent post entity.
        *   Recursively loop through comments:
            *   `create_entity_ignore_conflict` for each comment entity.
            *   `create_relationship_ignore_conflict` linking comment to post.
    *   **Returns:** `200 OK` with the post's entity details, ready for redirection.

This plan embraces the synchronous constraint by making it an explicit and controlled part of the user's journey, giving them agency over what gets imported and a clear understanding of the process.
