Here’s a comprehensive specification and documentation-style write-up of the **AI Sorting Room** product direction, fully detailed for internal use or to share with collaborators, investors, or early testers:

---

# 📄 AI Sorting Room: Product Specification

## Overview

**AI Sorting Room** is a minimalist, solo-first product where users submit a list of their own drafts, ideas, or beliefs—and an AI ranks them pairwise with reasoning. The user defines the ranking criteria via a custom prompt. The AI is the only voter, enabling a radically simple and private interface that feels like an externalized conscience or muse.

> “Instead of asking AI to generate for you, you ask it to judge you.”

This project inverts the ChatGPT paradigm: the user generates content, and the AI curates, ranks, and refines it.

---

## ✨ Product Summary

### Elevator Pitch

> “An LLM ranks your startup ideas, essay drafts, life directions, or beliefs—based on your custom prompt. Watch the ranking evolve in real time as you submit more. AI is your only voter.”

### Core Use Case

* User has many ideas, drafts, or thoughts
* Unsure which are most valuable, clear, persuasive, or aligned
* Uses the Sorting Room to **externalize judgment** and **refine direction**

---

## 🧠 Key Concepts

### Tag

A **Tag** is a context-specific session for comparing related ideas. Each tag includes:

* A **name** (e.g. `#founder-pitches`, `#essay-drafts`, `#personal-philosophies`)
* A **custom prompt preamble** describing the comparison criterion (e.g. “You are a wise investor evaluating clarity, originality, and coherence.”)

### Item

An **Item** is a unit of thought—a sentence, paragraph, draft, or idea to be ranked. All items are:

* Text-based
* Associated with a specific tag

### AI-Only Voting

All rankings are produced through AI pairwise comparisons using LLMs (e.g. Gemini Flash or GPT-4). The system:

* Compares items two at a time
* Gets a scalar score (-50 to +50)
* Stores the explanation for each vote
* Feeds all votes into a **Rank Centrality** algorithm to produce global consensus rankings
* Optionally runs **forward + reverse comparisons** to reduce bias

---

## 🖼 User Experience (MVP)

### 1. Sign Up / Login

* Magic email link or OAuth (Google/GitHub)
* User gets **100 free AI comparisons**
* Prompt to upgrade or bring their own OpenRouter API key if they run out

### 2. Create a Tag

User defines:

* `Tag name`
* `Prompt preamble` (optional, with good default like “Rank these items by clarity and depth.”)

### 3. Submit Items

User writes and submits 2–20+ ideas into a list UI. Examples:

* Paragraphs from their essay draft
* 10 startup ideas
* Competing product features
* Potential life decisions
* Personal philosophical beliefs

### 4. Watch Rankings Emerge

As items are submitted:

* Pairs are selected and scored
* Rankings are computed and streamed back live
* User sees:

  * A **live-updating leaderboard**
  * **Rationales** for recent comparisons
  * Optionally, a **"hall of close calls"**: comparisons where AI struggled to choose

### 5. Reflect / Export

* User can:

  * Download ranked list
  * Copy top 3 to clipboard
  * Mark certain items as “keepers”
* (Optional later) Save tag as a public profile snapshot

---

## 💻 Backend Architecture

### Core Tables

```sql
users(id, email, api_key, comparisons_used, created_at)
tags(id, user_id, name, prompt_preamble, created_at)
items(id, tag_id, text, created_at)
comparisons(id, tag_id, left_id, right_id, score, reasoning, model_used, created_at)
rank_snapshots(tag_id, computed_at, scores_json)
```

### Core Endpoints

* `POST /api/tags` → create tag
* `POST /api/tags/:id/items` → add item(s)
* `GET /api/tags/:id/stream` → long-poll or SSE; returns new comparisons and latest rankings
* `POST /api/tags/:id/comparisons/next` → for manual step-through (optional)
* `GET /api/tags/:id/rankings` → returns the current snapshot

---

## ⚙️ AI Prompt Format

Each pairwise comparison prompt follows this format:

```text
You are comparing two items based on a specific criterion.

Question: [prompt_preamble]

Items to compare:
[item A]
---------
[item B]

Please compare these items by:
1. Explaining your reasoning in 2–3 sentences.
2. Finally, provide a SCORE from -50 (strongly favor A) to +50 (strongly favor B).

Your response:
```

The system extracts:

* Reasoning text
* Final scalar score

(Optionally does reverse ordering and averages both.)

---

## 💰 Monetization Model

### Free Tier

* 100 comparisons (≈ 50 pairs)
* House OpenRouter key, rate-limited
* On exhaustion, user is prompted to upgrade

### Paid Tiers

* **Bring your own key** (ideal for technical users)
* **\$X for 500 comparisons** billed via Stripe

---

## 📈 Differentiation

| Feature             | Sorting Room | ChatGPT | Notion AI | Other AI tools |
| ------------------- | ------------ | ------- | --------- | -------------- |
| Self-curation       | ✅            | ❌       | ❌         | ❌              |
| Judgment-only UX    | ✅            | ❌       | ❌         | ❌              |
| Custom criteria     | ✅            | ❌       | ⚠️        | ⚠️             |
| Emotional resonance | ✅✅           | ⚠️      | ❌         | ❌              |
| Token-based cost    | ✅            | ✅       | ❌         | ✅              |

---

## 🧭 Roadmap (Post-MVP)

| Feature                 | Benefit                                                       |
| ----------------------- | ------------------------------------------------------------- |
| EmailSorter integration | BCC `rank@sorter.social` to sort anything                     |
| Weekly digest           | “Your top ideas this week, ranked”                            |
| Public tag pages        | Taste portfolios; social proof                                |
| Compare models mode     | Run the same tag with GPT vs Claude and highlight divergences |
| Community tags (opt-in) | See how others ranked the same beliefs                        |

---

## 🧠 Vision

> **AI Sorting Room is a new kind of cognitive interface—** not for generating content, but for discovering what matters.
> It treats the LLM not as a tool, but as a *soulful judge*—a higher-order mirror for the user’s mind.

This is your **spiritual OS** in miniature: one user, one prompt, many thoughts—ranked by something intelligent and outside of them.

---

Would you like me to turn this into a polished README, investor one-pager, or public-facing launch doc next?

