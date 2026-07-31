# K4b live proof — topic identity on the development database

Status: `proved interactively`

This record covers the outstanding interactive pass named in
`handover-state-2026-07-30.md` §7: migration `075` applied to a live database,
the 8 falsified-rule topics re-derived, and the four product-surface proofs
driven through real accounts. It completes the K4b evidence set alongside the
structural record (`k4b-topic-nodes-local-proof-2026-07-29.md`).

## Identity

- Branch: `feature/k4b-topic-nodes`
- Revision proved: `878bd35` (clean, pushed; evidence commit follows this run)
- Database: Supabase branch `voyager-dev`, project ref `hpotfrfdigzmhyibihst`
- Forbidden primary ref `iesprdzzgjypnksoljym`: never contacted
- Bench: `next dev` on port 3001 from this worktree; two persisted sessions —
  isaacasamoah on `localhost:3001` (captain, several voyages), elisheya on
  `127.0.0.1:3001` (crew, fambam only) — each identity confirmed from
  `/api/voyages`, not page text
- Driven 2026-08-01 09:16–09:40 AEST through `claude-has-hands`

## Migration 075

Applied 09:27 AEST through the owner's signed-in Supabase SQL editor, wrapped
in one explicit `begin;`/`commit;` transaction (21,082 bytes set through the
Monaco API, length verified before Run). The destructive-operations
confirmation dialog appeared for the trigger swaps and was confirmed — it is
the in-page React dialog the gotchas record predicted. Editor reported
`Success. No rows returned`.

Separate catalog verification after commit:

- `cartographer-single-claim-v4` contract row present with
  `topic_matcher_version = 'topic-retrieval-v4'`, candidate floor `0.2`,
  candidate limit `8`;
- `knowledge_topic_identity_outcomes` present and empty;
- active pointer still `cartographer-single-claim-v3` — activation correctly
  left to the backfill's pointer barrier.

## Re-derivation of the falsified-rule topics

`npx tsx recipes/cartographer-k4b-backfill.ts` from this worktree, `.env.local`
sourced. One run, no retries:

```json
{"activatedVersion":"cartographer-single-claim-v4","drainedJobs":0,
 "rederivedUnits":6,"assertion":{"orphanTopics":0,"oldNonTerminalJobs":0,
 "unitsMissingPhysics":0,"oldUnitsMissingTopicDerivation":0}}
```

The 8 topics minted under the falsified threshold rule became 5:

| Before (v3, over-split) | After (v4 matcher) |
|---|---|
| `coffee consumption` + `caffeine habits` | `coffee consumption` — **the motivating pair collapsed** |
| `physio appointment` + `rathdowne street clinic` | `physio appointment` — both physio units chose the same existing node |
| `melbourne half marathon` + `running training` | `melbourne half marathon training` |
| `coffee shops` | `favourite coffee shop` — stayed distinct from consumption (shared vocabulary, different subject) |
| `response length preference` | `answer length preference` |

Every one of the 6 pre-v4 units carries an immutable row in
`knowledge_topic_identity_outcomes`. Zero orphan topics remained (asserted,
not assumed). No false merge is present on inspection: no two genuinely
distinct subjects share a node. As the handover required, the success
criterion applied was *zero orphans, zero false merges, every unit carries an
outcome* — not a smaller topic count; the arguable pairs happened to merge and
the matcher's choices are defensible.

## The interactive drive

Six ordinary sentences typed into the real composer — no seeded rows, no
fixture inserts. The private aside was sent only after the
`→ private aside to Corvid` badge was visibly armed.

1–3. Isaac, to the room (one new subject, three phrasings):
*"Elisheya has signed up for a pottery class on Tuesday evenings."* /
*"The ceramics course Elisheya joined runs at the Brunswick community
studio."* / *"Elisheya's wheel throwing lessons start next week."*

4–5. Isaac, to the room (adjacent but distinct):
*"I'm doing daily guitar practice before work each morning."* /
*"I've booked a block of piano lessons starting in spring."*

6. Isaac, private aside: *"@corvid I'm planning a surprise anniversary trip to
Tasmania for Elisheya."*

All six extraction jobs reached `succeeded` under
`cartographer-single-claim-v4` within ~70 seconds of the first send.

## The four proofs

**1. Three phrasings converge to one topic node — pass.** The three pottery
units (`4d2230f0`, `9d64c6f2`, `efeca464` source events) all filed under a
single new `pottery class` topic whose node carries exactly **three** inbound
`about` edges. No sibling ceramics/wheel-throwing topic was minted.

**2. Adjacent-but-distinct subjects stay two — pass.** `daily guitar practice`
and `piano lessons` minted as **two** topic nodes, one inbound edge each.

**3. A private-only topic is invisible to the outsider, from her own
session — pass.**

- Structure: the `surprise anniversary trip to tasmania` topic node carries
  exactly **one** grant, Isaac's private audience `a1ab10d2…`; the pottery
  node's three grants are all room audience `81f1302a…`.
- Product Q&A, driven from Elisheya's session: asked about trips and Tasmania,
  Jeremy replied *"Found nothing substantive… the only matching item was your
  question just now."* Server log confirms her turn's searches matched only
  her own question.
- Strongest form — her own graph walk: asked to walk graph memory and list
  every claim with source ids, Jeremy returned exactly the **8 room-audience
  claims** and reported *"Not truncated — complete within the requested graph
  budgets."* The Tasmania claim is absent from an explicitly complete walk:
  no existence, label, count, or degree leak.

**4. `graph_memory` returns claims filed under the re-derived topics — pass.**
Isaac asked Corvid to walk graph memory and quote each claim's source event id
*from the tool result*. Source event ids exist only in the `graph_memory` tool
output — they appear in no chat history — so the reply's ids are proof of tool
reach rather than conversational recall. Corvid returned **9 typed claims,
not truncated**, whose ids match the database exactly: the two physio units
(filed under the re-derived `physio appointment` topic), the marathon unit
(`ecd23f62…`, byte-identical to the source event recorded in the K3 proof),
the three pottery units, guitar, piano, and the private Tasmania unit. The
three units absent from the walk (`answer length preference`, coffee after
2pm, favourite coffee shop) are exactly the three `preference`-typed units,
which standing context pre-loads and working-memory dedupe excludes — the
K4a-proven behaviour, observed again here.

Cross-check: 12 units on the database; Isaac's walk returned 9 (12 minus the
3 preference dedupes); Elisheya's walk returned 8 (the same set minus the
private Tasmania claim).

## Limitations, stated plainly

- The earlier conversational answer (physio + pottery in prose) was not
  treated as retrieval evidence: the aside turn shares the room conversation's
  message window, so facts visible in the room scroll can be answered from
  context. The id-based walk above is the evidence; the prose answer is not.
- Working-memory dedupe of the three preference units is attributed by type
  and design (preferences pre-load at attention ≥ 0.5), not by instrumenting
  `workingMemoryUnitIds` this pass. K4a proved the dedupe mechanism directly.
- Matcher quality numbers remain those of the committed 37-claim harness; this
  pass adds live behaviour on a small real corpus, not a re-measurement.

## Residue

The six proof sentences, their units, and four new topics (`pottery class`,
`daily guitar practice`, `piano lessons`, `surprise anniversary trip to
tasmania`) remain on `voyager-dev` as ordinary bench data, alongside the
re-derived topic set. Nothing was written anywhere else.
