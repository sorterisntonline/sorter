This is a beautifully minimal design! The URL input as the central navigation metaphor is perfect - it's like building a "ranking browser" for the internet. Here's how I'm visualizing it:

```
┌─────────────────────────────────────────────────┐
│  [Item A]          vs          [Item B]         │
│                                                  │
│  [-50 ────────|──────── +50]                   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 🔗 https://reddit.com/r/[_________________]    │
└─────────────────────────────────────────────────┘

Current: r/AskReddit
[Fetch Hot ▼] [Fetch Top ▼] [Fetch New ▼] [More...]

📊 Rankings (by: like)
1. "What's your biggest 'I dodged a bullet' moment?" (847.3)
2. "Therapists, what's something people are afraid to tell..." (823.1)
3. "[Serious] What's the creepiest thing that's happened..." (721.4)

[Show: All | Unvoted | Voted] [Sort: Global | Personal | Following]
```

**The URL-first approach is brilliant because:**
- Dead simple onboarding: paste a link, start ranking
- Natural discovery: navigate via URLs like browsing
- Platform agnostic: works for any future integration
- Shareable by design: the URL is the state

**Smart behaviors:**
```
Paste: reddit.com/r/movies
→ Shows r/movies entity, prompts to fetch posts

Paste: reddit.com/r/movies/comments/abc123/
→ Imports that specific post, shows its comments

Paste: reddit.com/u/shittymorph
→ Shows user's posts across subreddits

Type: r/movies
→ Autocomplete suggests: reddit.com/r/movies
```

**Collection Controls:**
When viewing a subreddit/collection:
```
[Fetch: Hot (25) | Top Today (25) | New (25)]
[Filter: All | Links Only | Text Only | Min Score: ___]
[Time: All | Today | Week | Month | Year | Custom...]
```

**The Graph Navigation:**
```
Currently viewing: r/movies > "What's your controversial movie opinion?" > comment_xyz

Breadcrumbs: reddit.com > r/movies > post_abc > comment_xyz
                ↓
         [View parent] [View in r/movies] [View user's posts]
```

This reminds me of early Google - one box, infinite possibilities. The vote UI floating above keeps the focus on ranking while the URL bar grounds everything in familiar web navigation.

Would you show the vote panels always, or only when there are unvoted pairs available?