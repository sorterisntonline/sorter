Excellent. Let's get very specific about the UX flows for these use cases, keeping your technical constraints in mind (synchronous, user-driven imports).

You've hit on the critical design challenge: **How do you present a unified sorting view of a large set (like a whole subreddit) while only importing small pieces of it on demand?**

The key is to design a UI that is transparent about what has been imported and makes the act of importing more content a core, rewarding part of the experience.

---

### A. Sorting an Entire Subreddit (Posts)

**The Goal:** A user wants to find the best post of all time in `r/art`.
**The URL:** `sorter.social/sort/r/art`

---

#### A1. Scenario: Nobody has sorted `r/art` before.

This is the "cold start" for this specific subreddit. The user experience should feel like "summoning" or "unlocking" this subreddit on Sorter.

**The User Journey:**

1.  **User navigates to `sorter.social/sort/r/art`**.
2.  Your backend receives the request, queries its `entities` table for a parent entity (`ns: 'reddit.com.subreddit'`, `pk: 'art'`) and finds nothing, or finds the parent but sees it has zero children.
3.  Instead of a spinner, the user sees a **"Summoning Gate"** page. This is a static, welcoming page that manages expectations.

    > **Mockup of the "Summoning Gate" Page:**
    >
    > ---
    >
    > ### You're the first to sort `r/art`!
    >
    > To get started, let's bring some of its best posts into Sorter. What would you like to sort first?
    >
    > *(This is a one-time import. The more we add, the better our leaderboards get.)*
    >
    > <br>
    >
    > `[ Sort the Top 100 Posts of This Year ]`  <-- *Recommended button*
    >
    > `[ Sort the Top 100 Posts of All Time ]`
    >
    > `[ Sort the Hottest 100 Posts Right Now ]`
    >
    > ---

4.  The user clicks **`[ Sort the Top 100 Posts of All Time ]`**.
5.  **The Synchronous Import:** The browser now shows a loading state. Your backend API is hit.
    *   It calls Reddit's API: `/r/art/top.json?t=all&limit=100`.
    *   It creates the parent entity for `r/art` if it doesn't exist.
    *   It loops 100 times, creating an `entity` for each post and an `entity_relationship` linking it to the `r/art` parent. Your `create_entity_ignore_conflict` is perfect here.
    *   This might take 5-10 seconds. That's fine, as you said.
6.  **The Result:** The API call finishes. The user is redirected to the main voting interface for this content set: `sorter.social/vote?ns=reddit.com.subreddit&pk=art`. The page now successfully fetches pairs of art posts for them to vote on.

This flow is user-driven, populates your database on demand, and feels like an accomplishment for the user.

---

#### A2. Scenario: `r/art` has some posts, but a user wants newer ones.

**The User Journey:**

1.  **User navigates to `sorter.social/sort/r/art`**.
2.  Your system finds the parent entity and sees it has children.
3.  **The page loads instantly**. The user sees the voting interface (`/vote?ns=...`) immediately and can start sorting the existing, previously-imported posts.
4.  On the page, there is a clear button: **`[ Import More Posts ]`** or **`[ Refresh with Latest ]`**.
5.  Clicking it doesn't immediately trigger an API call. Instead, it **opens the "Summoning Gate" UI again**, perhaps in a modal. The text is slightly different:

    > **Mockup of the "Import More" Modal:**
    >
    > ---
    >
    > ### Add more posts to `r/art`
    >
    > Let's expand the collection. What should we add?
    >
    > <br>
    >
    > `[ Import the Top 100 Posts of This Month ]`
    >
    > `[ Import the Hottest 100 Posts Right Now ]`
    >
    > ---

6.  The user clicks a button, a synchronous import happens in the background, and new posts are added to the pool of sortable items for `r/art`. The user can continue voting while this happens, and the new items will naturally start appearing in subsequent pairs.

---

### B. Sorting a Subreddit's Comments (The Novel Use Case)

**The Goal:** Find the best AskReddit comment of all time.
**The URL:** `sorter.social/sort/r/askreddit/comments`

This requires a different UX because we can't possibly fetch all comments. The UX must be about **collaboratively building the dataset**.

**The User Journey (and how to decouple import/query):**

1.  **User navigates to `sorter.social/sort/r/askreddit/comments`**.
2.  Your backend needs to identify the pool of comments.
    *   **The Query:** "Find all `entity` rows where `ns = 'reddit.com.comment'` whose parent post has a parent entity of `ns = 'reddit.com.subreddit'` and `pk = 'askreddit'`."
    *   Let's assume on the first visit, this query returns zero results.

3.  **The "Seed the Ocean" UI:** The user sees an empty state page, optimized for the first action.

    > **Mockup of the "Seed the Ocean" Page:**
    >
    > ---
    >
    > ### What is the Best Comment in r/AskReddit?
    >
    > No one knows... yet. To find out, we need to build the collection of comments to sort.
    >
    > **Help us by adding a legendary AskReddit thread.**
    >
    > [________________ Paste Reddit Thread URL Here ________________] `[ Import Comments ]`
    >
    > ---

4.  **User pastes a URL** to a famous AskReddit thread and clicks `[ Import Comments ]`.
5.  **The Synchronous Import (Thread-level):**
    *   Your backend gets the request with the URL.
    *   It hits Reddit's API for that specific thread (e.g., `/r/AskReddit/comments/post_id.json?limit=500`).
    *   It runs the import logic: creates entities for the post and all its top-level comments, and the necessary relationships.
6.  **The Page Transforms:** After the import completes, the page reloads.
    *   The backend query for "all imported AskReddit comments" now returns results.
    *   The page now shows the **main voting interface**. But crucially, it also shows context and the next call-to-action.

    > **Mockup of the "Growing the Ocean" Page:**
    >
    > ---
    >
    > ### Sorting 1,247 Comments from r/AskReddit
    >
    > *Help us discover the greatest comment of all time by adding more classic threads to the pool.*
    >
    > [________________ Paste another Reddit Thread URL Here ________________] `[ Add to Sort ]`
    >
    > <br>
    >
    > `[ The Pairwise Voting UI for two random comments appears here ]`
    >
    > `[ Below the voting UI, you can show a 'Live Leaderboard' of the current top-ranked comments ]`
    >
    > ---

### How This Decouples Import and Query:

You nailed it with your "hmmm." This design is the solution:

*   **Import Action (The "Write"):** This is always a discrete, user-initiated event targeted at a *single URL* (a thread). It's a `POST` request to an importer endpoint (e.g., `/api/import/reddit/thread`). Its only job is to add nodes and edges (`entities` and `relationships`) to your graph database. It doesn't know or care about the "global subreddit comment sort."

*   **Query Action (The "Read"):** This is handled by your `pair` or `rank` endpoints. When a user is on the `/sort/r/askreddit/comments` page:
    *   To get a new pair to vote on, the frontend calls your `/api/pair` endpoint. It needs a new mode, like `/api/pair?context=subreddit_comments&subreddit=askreddit`.
    *   This endpoint then executes the complex "find me two random comments from the entire `askreddit` imported comment pool" query against your database. It is completely decoupled from the import action. It just reads whatever state the database is currently in.

This model is powerful:

1.  **User-Driven:** Your data surface area only grows when a user explicitly asks it to.
2.  **Scalable:** You can handle a view of millions of comments even though each user action only adds a few thousand at a time.
3.  **Engaging:** It turns the user from a simple voter into a curator, a "digital archivist" who is helping build this "memory module." This is a much more compelling interaction loop.
4.  **No Background Jobs Needed (For Now):** The synchronous request/response cycle works perfectly for this UX. The user understands they are performing a specific, chunky "import" action and the wait time is justified.