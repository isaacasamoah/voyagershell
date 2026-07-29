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
| One-payload migration | After the exact through-073 baseline, the complete migration 074 body was sent in one `psql -c` simple-query payload and installed successfully. The candidate query avoids consuming the newly added enum value before the payload commits. |
| Three phrasings, one subject | `quantum engines`, `QE systems`, and `quantum propulsion` resolved to one authority/topic node with exactly three inbound `about` edges. |
| Genuinely new subject | `sourdough fermentation` minted exactly one new authority/topic node. |
| Concurrent paraphrase race | Two independent completion transactions for `orbital ceramics` and `spacecraft ceramic shields` were started together behind the production global advisory key. PostgreSQL reported exactly two lock-waiting completion queries before release. Both committed; one topic node and two inbound `about` edges remained. |
| Adjacent but distinct | Orthogonal fixtures for `marathon training` and `trail running` produced exactly two topic nodes. |
| Private-only visibility | A separate `private telescope` topic had one private unit, one private-audience grant, and no room evidence. The outside viewer received no existence grant, label, root traversal, or authorized neighbor/degree count. With that viewer's authenticated identity installed, an exact table-count probe for the topic was permission-denied. |
| Mixed visibility | The unrelated viewer received no grant, label, root traversal, or authorized degree for the mixed `recovery planning` topic. The room member saw the topic label and exactly the room unit/degree `1`; the private unit was absent. The private author saw both units/degree `2`. Four general authority-surface probes as `authenticated` were also permission-denied. |
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

---

## Live pass, 2026-07-29 — K4-C2 falsified on real embeddings

Migration `074` was applied to `voyager-dev` and the backfill run against it:
contract v3 activated, 6 units re-derived, assertions clean (0 non-terminal
pre-v3 jobs, 0 units missing physics, 0 units missing topic derivation).

**What worked.** Both physio units — separate source events — resolved to the
same `physio appointment` topic. Convergence across events is real. Types
re-derived sensibly (marathon → domain, physio → operational, preferences →
preference), and `about → person` edges were preserved.

**What failed.** Measured `text-embedding-3-small` cosine similarity on the
actual labels, against the 0.7 threshold:

| Must merge | | Must stay separate | |
|---|---|---|---|
| `quantum engines` ~ `the qe work` | 0.447 | `coffee consumption` ~ `coffee shops` | 0.611 |
| `the qe work` ~ `quantum propulsion` | 0.380 | `marathon training` ~ `trail running` | 0.601 |
| `coffee consumption` ~ `caffeine habits` | 0.646 | `melbourne half marathon` ~ `running training` | 0.424 |

Must-merge runs as low as **0.380**; must-split runs as high as **0.611**. The
bands overlap, so no single threshold satisfies both directions. This is a
design falsification, not a calibration gap — and it reproduced on real data,
not only the contrived example: the backfill minted both `coffee consumption`
and `caffeine habits` for one claim.

The structural proof passed because it used synthetic vectors. That is the
limitation the build report named honestly, and it was the right one to name.

**Residue on `voyager-dev`:** 8 topics minted under the falsified rule, usable
but knowingly over-split. Topic rows are immutable, so re-derivation is part of
whichever design replaces this one.
