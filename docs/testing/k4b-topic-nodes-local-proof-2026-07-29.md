# K4b local proof — topic nodes and ordered backfill

Status: `structural pass`

This record covers the bounded, disposable-Postgres proof for K4b. It decides
whether topic nodes and the backfill are ready to enter the later two-account
interactive pass. It is not browser, hosted-database, deployment, or release
evidence.

## Identity and boundary

- Branch: `feature/k4b-topic-nodes`
- Base: `dev@6bc425a70ab79f4a11cd1801ecabc0f78876b4ec`
- Database: one disposable `pgvector` PostgreSQL container with `--network none`
- Candidate: migration `074_topic_nodes.sql`
- No Supabase project was contacted. In particular, neither the development
  ref nor the production ref was read or written.
- K4c relationship tables, jobs, attempts, outcomes, assertions, and writers
  remain absent.

## Observations

| Falsification | Observed result |
|---|---|
| Three phrasings, one subject | `quantum engines`, `QE systems`, and `quantum propulsion` resolved to one authority/topic node with exactly three inbound `about` edges. |
| Genuinely new subject | `sourdough fermentation` minted exactly one new authority/topic node. |
| Concurrent paraphrase race | Two independent completion transactions for `orbital ceramics` and `spacecraft ceramic shields` were started together behind the production global advisory key. PostgreSQL reported exactly two lock-waiting completion queries before release. Both committed; one topic node and two inbound `about` edges remained. |
| Adjacent but distinct | Orthogonal fixtures for `marathon training` and `trail running` produced exactly two topic nodes. |
| Private and mixed visibility | The unrelated viewer received no grant, label, root traversal, or authorized degree for the mixed topic. The room member saw the topic label and exactly the room unit/degree `1`; the private unit was absent. The private author saw both units/degree `2`. Direct table and function probes as `authenticated` produced four permission denials. |
| Enqueue-first cutover | An open event transaction held the active-pointer `FOR SHARE` lock. Activation was still waiting when probed. The event committed first with v2, after which activation completed; the v2 job was drained before re-derivation. |
| Activation-first cutover | Activation held the pointer row. A new event transaction was still waiting when probed, then resumed after activation and stamped v3. |
| Backfill terminal assertion | The unified pass left `oldNonTerminalJobs=0`, `unitsMissingPhysics=0`, and `oldUnitsMissingTopicDerivation=0`. |

Stable recipe verdict:

```text
CARTOGRAPHER_K4B_LOCAL_GREEN
```

## What this does not prove

The proof supplies deterministic 1536-dimensional vectors so it can falsify
locking, matching, false merging, authorization, and cutover structure without
network access. It does not establish how real OpenAI embeddings cluster these
phrases. That is exactly the next two-account interactive pass; it cannot
change whether this revision is structurally ready to enter that pass.

No browser was driven, no live migration or backfill was run, and no K4c,
Forge, pull request, merge, preview, or production action occurred.
