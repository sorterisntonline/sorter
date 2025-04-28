Okay, let's paint a picture of the user experience (UX) for the proposed site, focusing on the "Sort Your Recent Spotify Jams in Sets" model.

**Target Vibe:** Simple, focused, immediate, satisfying, potentially addictive. Minimalist aesthetics, quick interactions.

**The User Journey:**

1.  **Landing / First Visit:**
    *   **Screen:** Minimalist page. Large, clear headline like "Rank Your Latest Jams" or "Discover Your True Taste." A prominent "Login with Spotify" button. Maybe a subtle animation hinting at sorting/ranking.
    *   **Goal:** Instantly communicate the core purpose and provide the single entry point. Low clutter, high focus.
    *   **Interaction:** User clicks "Login with Spotify."

2.  **Spotify Authentication:**
    *   **Screen:** User is redirected to Spotify's standard OAuth login/permission screen (potentially within an Auth0-managed flow).
    *   **Goal:** Securely authenticate the user and get permission to read their recently played tracks (`user-read-recently-played` scope).
    *   **Interaction:** User logs into Spotify (if needed) and explicitly approves the permission request. They are then redirected back to the app.

3.  **First Load / Home Screen (Post-Login):**
    *   **Screen:** A brief loading indicator ("Fetching your latest tracks..."). Once loaded, it displays the **Core Sorting Interface:**
        *   **Header:** Maybe "Sort Set 1 of X" or "What did you prefer?".
        *   **Main Area:** Two songs from the first "set" of 5 recently played unique tracks are displayed side-by-side. Embeds (`SpotifyPlayer`) allow easy playback. Minimal artist/album info might be shown below each.
        *   **Interaction Element:** The comparison slider (-50 to +50) is clearly visible below the pair. A "Next Pair" button might appear *after* the slider is moved, or the view might auto-advance after sliding. (TBD - test what feels smoother).
        *   **Progress Indicator:** A subtle visual showing progress within the current set (e.g., "3 / 10 comparisons done", or a small progress bar filling up).
    *   **Goal:** Immediately present the core sorting task with familiar content. Make interaction obvious and easy.
    *   **Interaction:** User listens (optional), moves the slider to indicate preference, and clicks "Next Pair" (or interaction triggers auto-advance).

4.  **Sorting the Set:**
    *   **Screen:** The UI dynamically updates, showing the next pair of songs *from the same set of 5* that needs comparison, based on the backend's pairing logic. The progress indicator updates.
    *   **Goal:** Guide the user through the ~10 comparisons needed to rank the current set. Keep it fast-paced.
    *   **Interaction:** Repeat the slider interaction for each pair until the set is fully compared.

5.  **Submitting the Set:**
    *   **Screen:** Once the last comparison for the set is made, the slider/pair area might change to a prominent "Submit Set" or "Finalize Rankings for this Set" button.
    *   **Goal:** Provide a clear action to finalize the user's input for the current batch.
    *   **Interaction:** User clicks "Submit Set."

6.  **Submission & Feedback (The Reward Loop):**
    *   **Screen:**
        *   An immediate, satisfying animation plays (e.g., the 5 song covers shrinking and flying "up" or "into" a representation of their master ranking). Short and sweet (0.5-1 second).
        *   The animation is quickly replaced by the **"Ranking Change Report."** This is displayed clearly:
            *   "Results from Set X:"
            *   A short list showing significant changes to the user's *overall* ranking caused by this submission. Uses clear icons (up arrow, down arrow, new entry star) and concise text:
                *   🟢 `Idioteque` ▲ Up 3 places!
                *   🔴 `Pyramid Song` ▼ Down 1 place.
                *   ✨ `Bloom` entered your Top 20!
            *   If no significant changes, maybe a message like "Preferences confirmed!" or "No major shifts this time."
        *   Below the report, a button like "Sort Next Set" or "Continue" appears.
    *   **Goal:** Provide instant gratification, show the impact of the user's input, and encourage continuation.
    *   **Interaction:** User reads the feedback, feels a sense of accomplishment/curiosity, and clicks "Sort Next Set."

7.  **Continuing / Completion:**
    *   **Screen:** If more unranked recent tracks exist, the UI loads the *next* set of 5, returning to the **Core Sorting Interface** (Step 3), potentially indicating "Set 2 of X".
    *   **Screen (Completion):** If all recently played tracks have been incorporated into sets and sorted, the screen changes to a summary state:
        *   Maybe shows the user's updated overall Top 10/20 ranked songs.
        *   Perhaps highlights the biggest "risers" or "new entries" from their entire listening history.
        *   A prominent **Share** button (to share their Top List or a summary graphic).
        *   A message like "All caught up! Come back after you listen to more music." or "Your taste profile is up-to-date."
    *   **Goal:** Provide a satisfying end state for the session, encourage sharing, and set the expectation for return.
    *   **Interaction:** User explores their ranking, potentially shares, and closes the app until their next listening session triggers a desire to return.

**Supporting Screens (Likely V1.5+):**

*   **Profile:** Shows overall stats, maybe the full personal ranking, allows managing Spotify connection, logout.
*   **Friends / Social Feed (V2):** Allows connecting with friends, seeing their activity/rankings, generating collective playlists.

This UX flow prioritizes a tight, repeatable loop driven by the user's own behavior, offering immediate relevance and consistent, incremental rewards.
