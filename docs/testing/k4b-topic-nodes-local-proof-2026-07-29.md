# K4b local proof — topic nodes and ordered backfill

Status: `structural and implementation-bound matcher pass`

This record covers the bounded, disposable-Postgres proof for K4b. It decides
whether the re-derived topic identity pipeline meets its local Test boundary.
It is not browser, hosted-database, deployment, or release evidence.

## Identity and boundary

- Branch: `feature/k4b-topic-nodes`
- Base: `dev@6bc425a70ab79f4a11cd1801ecabc0f78876b4ec`
- Database: one disposable `pgvector` PostgreSQL container with `--network none`
- Candidate: migrations `074_topic_nodes.sql` and
  `075_topic_identity_matcher.sql`
- No Supabase project was contacted. In particular, neither the development
  ref nor the production ref was read or written.
- K4c relationship tables, jobs, attempts, outcomes, assertions, and writers
  remain absent.

## Observations

| Falsification | Observed result |
|---|---|
| Migration lineage | After the exact through-073 baseline, migration 074 installed unchanged, a v3 split-topic residue was created, then migration 075 installed the replacement identity mechanism. |
| Three phrasings, one subject | `quantum engines`, `QE systems`, and `quantum propulsion` resolved to one authority/topic node with exactly three inbound `about` edges. |
| Genuinely new subject | `sourdough fermentation` minted exactly one new authority/topic node. |
| Concurrent paraphrase race | Two independent “new topic” completions waited behind the global advisory key. One committed; the other received `knowledge_topic_candidates_stale`, was re-matched against the new candidate, and reused it. One topic node and two inbound `about` edges remained. |
| Adjacent but distinct | Orthogonal fixtures for `marathon training` and `trail running` produced exactly two topic nodes. |
| Private-only visibility | A separate `private telescope` topic had one private unit, one private-audience grant, and no room evidence. The outside viewer received no existence grant, label, root traversal, or authorized neighbor/degree count. With that viewer's authenticated identity installed, an exact table-count probe for the topic was permission-denied. |
| Mixed visibility | The unrelated viewer received no grant, label, root traversal, or authorized degree for the mixed `recovery planning` topic. The room member saw the topic label and exactly the room unit/degree `1`; the private unit was absent. The private author saw both units/degree `2`. Four general authority-surface probes as `authenticated` were also permission-denied. |
| Enqueue-first cutover | An open event transaction held the active-pointer `FOR SHARE` lock. Activation was still waiting when probed. The event committed first with v3, after which activation completed; the v3 job was drained before re-derivation. |
| Activation-first cutover | Activation held the pointer row. A new event transaction was still waiting when probed, then resumed after activation and stamped v4. |
| Backfill terminal assertion | The unified pass removed the seeded v3 split and left `oldNonTerminalJobs=0`, `unitsMissingPhysics=0`, `oldUnitsMissingTopicDerivation=0`, and `orphanTopics=0`. |

Stable recipe verdict:

```text
CARTOGRAPHER_K4B_LOCAL_GREEN
```

## What this does not prove

The PostgreSQL recipe uses deterministic 1536-dimensional vectors to isolate
locking, server execution, authorization, and cutover structure. The committed
harness separately uses real OpenAI claim embeddings and the exact matcher
instruction. Neither proves behavior on accumulated real Voyager memories;
that corpus does not yet exist, and it cannot change this bounded readiness
decision because the named 37-claim gate is satisfied.

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
but knowingly over-split. The replacement now includes controlled
re-derivation; applying it to that live residue remains a separately authorized
operation and was not part of this proof.

---

## Re-derived implementation pass, 2026-07-29

The checked-in contract is `cartographer-single-claim-v4` with matcher
`topic-retrieval-v4`, candidate floor `0.2`, and window `8`. The harness loaded
that exact contract, embedded all 37 claims with `text-embedding-3-small`, and
gave the matcher each candidate's label plus its nearest authorized claim,
matching the production payload while scoring the 666 labelled pairs.

| Measure | Observed |
|---|---:|
| Directional blocking recall@8 | 0.973 |
| True-pair blocking recall@8 | 33/33 = 1.000 |
| Matcher precision | 1.000 |
| Matcher recall | 0.939 |
| Pipeline F1 | 0.969 |
| False merges | 0 |

The authoritative experiments showed that prompt wording materially changes
the result, so this exact retrieval-framed instruction is versioned with the
extractor contract.

The production-shaped matcher left two same-subject pairs split: the two
quantum-work claims against the broader quantum-propulsion claim. Those false
splits preserve the precision-first contract and do not cross the acceptance
boundary.

Final harness verdict:

```text
TOPIC_IDENTITY_HARNESS_GREEN
```

No browser or live database was used for the rework. K4c was not opened.
