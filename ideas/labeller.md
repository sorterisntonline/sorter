### The “Labeller” in one sentence

A **drop-in, pay-as-you-go service for collecting *pairwise preference data*** (with automatic transitive-closure amplification) so ML teams can train, fine-tune, and evaluate models **without building their own RLHF pipeline or hiring a large labeling workforce**.

---

## 1 ️⃣  Why the world suddenly needs this

| What ML teams are doing today                                                | Pain points                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RLHF / DPO / RLAIF** to align LLMs, vision models, robotics policies       | • Internal tooling is brittle and ad-hoc<br>• Crowdsourcing marketplaces (Scale, Surge, MTurk) are optimized for *single-label* tasks, not *comparisons*<br>• Pairwise data explodes quadratically in cost<br>• Researchers waste weeks wiring up spreadsheets + bespoke scripts |
| **Offline evaluation** of generative systems (text, images, policy rollouts) | • Numeric metrics (BLEU, FID, reward proxies) correlate poorly with human judgment<br>• Existing A/B dashboards ignore *strength* of preference                                                                                                                                  |
| **Rapid iteration** on prompts / small model variants                        | • Even small teams need hundreds–thousands of comparisons per day, but spinning up a labeling squad is overkill                                                                                                                                                                  |

---

## 2 ️⃣  What the Labeller gives them

1. **Pairwise slider UI** (-50 … +50)
   Captures *direction* **and** *magnitude* in one click; richer signal than binary votes.

2. **Transitive-closure amplification**

   * Every new comparison “lights up” a whole patch of the graph via Rank Centrality / Elo.
   * Typical **5–10× reduction** in human judgments to reach a stable ordering.
   * Works out of the box; teams don’t touch math.

3. **Python / REST SDK**

   ```python
   import sorterlab
   run = sorterlab.create_run(items=text_candidates,
                              prompt="Rate helpfulness")
   run.collect()   # opens hosted UI
   scores = run.rank()
   ```

   Zero infra; artifact comes back as a tidy DataFrame ready for DPO or reward-model training.

4. **SaaS dashboard & webhook**

   * Live convergence plots, inter-annotator agreement, cost tracking.
   * Webhook fires when a run hits desired confidence → triggers fine-tune job automatically.

---

## 3 ️⃣  The wedge market

| Segment                                                  | Why they bite first                                                                                             | TAM today      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------- |
| **<50-person AI startups** (new chatbots, vertical LLMs) | • No labeling ops team<br>• Need to show investors fast iteration<br>• Value “drop-in” simplicity over \$/label | \~2 000 cos¹   |
| **Academic / nonprofit research labs**                   | • Grant-funded but lean<br>• Publish-or-perish → want reproducible, transparent pipeline                        | \~1 000 groups |
| **Robotics & RL labs**                                   | • Sparse reward shaping is hard; pairwise human judgments convert demos into smooth reward                      | \~200 orgs     |
| **Internal AI teams at mid-size SaaS companies**         | • Tuning small domain-specific models cheaper than renting GPT-4o<br>• Compliance prefers on-prem SDK           | 5 000+         |

*¹ rough count of orgs in OpenRouter, LangChain, HuggingFace Indie lists.*

---

## 4 ️⃣  How it’s different from Scale / Surge / Labelbox

| Labeller (Sorter)                                                      | Existing data-label vendors                      |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| **Optimized for comparisons**: ranking graph, transitive math baked in | Optimized for single-label classif./bbox tasks   |
| **Self-serve**: 5-min Python script, no sales call                     | Enterprise contracts, high minimums              |
| **Small-team pricing**: per-comparison, usage tiers                    | Seat licences + project fees                     |
| **Open algorithm**: RC/Elo source visible, audit-ready                 | Black-box scoring; expensive to export raw votes |

---

## 5 ️⃣  Strategic value for *Sorter* as a whole

1. **Revenue before virality**
   Cash-flows the bigger “social Sorter” vision without raising VC.

2. **Proving the ranking engine in production**
   Real-world signal validates Rank Centrality scalability and UI ergonomics.

3. **Beachhead with technical early adopters**
   ML engineers become champions; same audience that can later embed Sorter-DSL or link to Social Sorter leaderboards.

4. **Data network effects**
   Anonymized comparison graphs can seed baseline priors for future customers (opt-in), compounding utility.

---

## 6 ️⃣  The crisp elevator pitch

> **“GitHub Copilot made coding cheap; we make *alignment* cheap.**
> Plug our Labeller into your training loop, get human-grade preference data at a fraction of the cost—no ops team, no spreadsheet headaches.”

That’s the angle. A tight, dev-first micro-SaaS that occupies the white space between DIY hacks and heavyweight labeling vendors, while quietly building the foundation for Sorter’s grander consensus engine.
