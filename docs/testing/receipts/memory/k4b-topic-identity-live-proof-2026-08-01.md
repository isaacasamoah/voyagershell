# K4b live proof — topic identity on the development database

Status: `current`

Sanitization: exact hosted refs, account handles, session topology, personal
messages, topic labels, source ids, and operational UI logs were redacted.
Revisions, counts, database shapes, verdicts, limitations, and residue remain.

This record covers the outstanding interactive pass named in
`handover-state-2026-07-30.md` §7: migration `075` applied to a live database,
the 8 falsified-rule topics re-derived, and the four product-surface proofs
driven through real accounts. It completes the K4b evidence set alongside the
structural record (`k4b-topic-nodes-local-proof-2026-07-29.md`).

## Identity

- Branch: `feature/k4b-topic-nodes`
- Revision proved: `878bd35` (clean, pushed; evidence commit follows this run)
- Database: authorized development target; production was never contacted
- Bench: `next dev` from this worktree; two persisted accounts on isolated
  origins, identities confirmed from `/api/voyages`, not page text
- Driven 2026-08-01 through the real browser surface

## Migration 075

Applied through the owner's signed-in Supabase SQL editor, wrapped in one
explicit `begin;`/`commit;` transaction. The reviewed trigger swaps raised the
expected destructive-operation confirmation and the transaction succeeded.

Separate catalog verification after commit:

- `cartographer-single-claim-v4` contract row present with
  `topic_matcher_version = 'topic-retrieval-v4'`, candidate floor `0.2`,
  candidate limit `8`;
- `knowledge_topic_identity_outcomes` present and empty;
- active pointer still `cartographer-single-claim-v3` — activation correctly
  left to the backfill's pointer barrier.

## Re-derivation of the falsified-rule topics

At the proved revision, the operation was invoked from its then-current source
path with `.env.local` sourced. The current equivalent is
`npm run memory:k4b-backfill`. One run, no retries:

```json
{"activatedVersion":"cartographer-single-claim-v4","drainedJobs":0,
 "rederivedUnits":6,"assertion":{"orphanTopics":0,"oldNonTerminalJobs":0,
 "unitsMissingPhysics":0,"oldUnitsMissingTopicDerivation":0}}
```

The 8 topics minted under the falsified threshold rule became 5:

| Before (v3, over-split) | After (v4 matcher) |
|---|---|
| related consumption labels | one topic — **the motivating pair collapsed** |
| related appointment labels | one topic — both units chose the same existing node |
| related event/training labels | one topic |
| place-preference label | stayed distinct from consumption (shared vocabulary, different subject) |
| response-length label | one normalized preference topic |

Every one of the 6 pre-v4 units carries an immutable row in
`knowledge_topic_identity_outcomes`. Zero orphan topics remained (asserted,
not assumed). No false merge is present on inspection: no two genuinely
distinct subjects share a node. As the handover required, the success
criterion applied was *zero orphans, zero false merges, every unit carries an
outcome* — not a smaller topic count; the arguable pairs happened to merge and
the matcher's choices are defensible.

## The interactive drive

Six ordinary sentences were typed into the real composer — no seeded rows, no
fixture inserts. The private aside was sent only after its private-audience
badge was visibly armed: three room sentences phrased one subject three ways,
two room sentences described adjacent but distinct subjects, and one private
sentence introduced a private-only subject.

All six extraction jobs reached `succeeded` under
`cartographer-single-claim-v4` within ~70 seconds of the first send.

## The four proofs

**1. Three phrasings converge to one topic node — pass.** The three units
(source ids retained only in owner evidence) all filed under a single new topic
whose node carries exactly **three** inbound `about` edges. No sibling topic
was minted.

**2. Adjacent-but-distinct subjects stay two — pass.** The two adjacent subjects
minted as **two** topic nodes, one inbound edge each.

**3. A private-only topic is invisible to the outsider, from her own
session — pass.**

- Structure: the private topic node carries exactly **one** grant, Account A's
  private audience; the shared topic's three grants are all room audience.
- Product Q&A, driven from Account B's session, returned no substantive match.
  Server logs confirmed the turn's searches matched only Account B's question.
- Strongest form — her own graph walk: asked to walk graph memory and list
  every claim with source ids, the Voyager returned exactly the **8
  room-audience claims** and reported a complete, non-truncated result. The
  private claim is absent from an explicitly complete walk:
  no existence, label, count, or degree leak.

**4. `graph_memory` returns claims filed under the re-derived topics — pass.**
Account A asked its Voyager to walk graph memory and quote each claim's source event id
*from the tool result*. Source event ids exist only in the `graph_memory` tool
output — they appear in no chat history — so the reply's ids are proof of tool
reach rather than conversational recall. The Voyager returned **9 typed claims,
not truncated**, whose ids matched the database exactly: two units under the
re-derived shared topic, one event unit, three paraphrase units, two
adjacent-subject units, and the private unit. The three units absent from the
walk are exactly the three `preference`-typed units,
which standing context pre-loads and working-memory dedupe excludes — the
K4a-proven behaviour, observed again here.

Cross-check: 12 units on the database; Account A's walk returned 9 (12 minus
the 3 preference dedupes); Account B's walk returned 8 (the same set minus the
private claim).

## Limitations, stated plainly

- The earlier conversational answer (redacted personal content in prose) was not
  treated as retrieval evidence: the aside turn shares the room conversation's
  message window, so facts visible in the room scroll can be answered from
  context. The id-based walk above is the evidence; the prose answer is not.
- Working-memory dedupe of the three preference units is attributed by type
  and design (preferences pre-load at attention ≥ 0.5), not by instrumenting
  `workingMemoryUnitIds` this pass. K4a proved the dedupe mechanism directly.
- Matcher quality numbers remain those of the committed 37-claim harness; this
  pass adds live behaviour on a small real corpus, not a re-measurement.

## Residue

The six proof sentences, their units, and four new topics remain in the
authorized development database as ordinary bench data, alongside the
re-derived topic set. Nothing was written anywhere else.
