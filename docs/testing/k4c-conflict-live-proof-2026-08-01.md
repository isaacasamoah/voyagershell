# K4c live proof — conflict ledger on the development database

Status: `proved interactively`

This record covers the live interactive pass for the K4c conflict ledger
(`k4c-relations-rethink-2026-08-01.md` §Proof plan): migration `077` applied to
a live database, the eligibility backfill drained through real turns, and the
central conflict discovered, gated, and surfaced through the product — with the
victim's-seat privacy bar held.

## Identity

- Branch: `feature/k4c-conflict-ledger` @ `82f52c4` (review-approved rework)
- Database: Supabase `voyager-dev` (`hpotfrfdigzmhyibihst`); forbidden primary
  ref never contacted
- Bench: `next dev` on port 3001 from this worktree; two persisted sessions —
  isaacasamoah on `localhost:3001` (captain), elisheya on `127.0.0.1:3001`
  (crew, fambam only) — identities confirmed from `/api/voyages`, not page text
- Driven 2026-08-01 19:48–20:10 AEST through `claude-has-hands`
- Model path: the real per-user production resolution (not the harness lane)

## Migration 077

Applied 19:50 AEST through the owner's signed-in SQL editor in one explicit
`begin;`/`commit;` transaction (39,053 bytes set through the Monaco API, length
verified before Run). `Success. No rows returned`. Purely additive — no
destructive-operation dialog. Catalog verified by separate reads:

- `knowledge_relation_contract_active` → `relation-conflict-v2`
- `knowledge_relation_backfill_runs` → `completed:21/256` (bounded eligibility
  backfill enqueued 21 per-person jobs, marker row recorded)
- `anon` cannot execute `begin_relation_attempt` (pg_proc privilege probe)
- All 7 `knowledge_relation*` tables present

## The drain, and the judge's restraint (K4c-R4 live)

Seven real turns (private asides through the composer, badge verified armed
before every send) drained Isaac's queue: **14 jobs completed, every outcome
`succeeded`, zero relation edges minted** — the compatible K4b-era units
(pottery, ceramics, coffee, physio appointments, piano) co-filed under shared
topics produced no edges. Mere topical overlap never minted a relation, live.

**A negative worth keeping:** the first attempted conflict vector — "a physio
instructed no running for six weeks" (Isaac's own restriction) — judged
`none` against "Elisheya is training for the Melbourne half marathon," and
that is CORRECT: one person's restriction does not make another person's
training wrong. The judge refused a conflict a careless reading would have
minted. Job `completed/succeeded/relations:0`.

## The central conflict (K4c-R1/R3 live)

Isaac, private aside (badge `→ private aside to Corvid` verified): *"the
physio also looked at my wrist today: no guitar at all until it settles, so
the daily morning practice is off completely."* The claim extracted; its
relation job drained on the next turn. Result, verified in the ledger:

- **One edge:** `"isaacasamoah has been advised by a physio not to play
  guitar… daily morning practice is currently canceled" -[supersedes]-> "The
  user does daily guitar practice before work each morning."` — correct
  verdict under Amendment 1's boundary (current state of the same commitment;
  keeping both incoherent), correct direction (newer → older)
- **One assertion row** recording the judgment's inputs — the privacy gate

## The four proofs

**1. Product surface answers "which is current?" — pass.** Corvid's reply to
"what does my morning routine actually look like now?" rewrote the routine
around the ban ("recovery-first: no guitar at all…"). The compounding moment,
observed on the real surface.

**2. Isaac's tool-anchored walk — pass.** Corvid returned both claims with
their source event ids from the tool result (`2c71d221…` the practice,
`835a865a…` the restriction — ids exist only in tool output) and named the
restriction as current.

**3. Victim's seat — pass, the decisive one.** From Elisheya's own session,
Jeremy walked graph memory: **8 claims, "Not truncated — complete within the
requested graph budgets."** The room guitar claim present (she is granted it);
the wrist restriction, the supersedes edge, and any correction **absent** from
an explicitly complete walk — no existence, label, count, or degree leak. The
derived fact stayed as private as its private ingredient.

**4. Per-person laziness — pass.** Elisheya's 11 backfill jobs remain
`pending` — she took no ordinary turns; her queue drains at her next
authorized turns by design.

## Limitations, stated plainly

- The `graph_memory` claim projection does not annotate relation verdicts in
  its payload — the edge shapes reach and privacy, and the model infers
  currency from claim content. Corvid noted this itself ("does not explicitly
  mark a formal replaces edge") while still answering correctly. Surfacing
  verdict annotations is a K5-adjacent decision, deliberately not smuggled in
  here.
- Harness P/R numbers were measured on the Codex classification lane; this
  pass exercised the real per-user model resolution live and the judgments
  were correct, but the live sample is one conflict + ~15 restraint cases,
  not a re-measurement.
- Elisheya's pending backfill jobs were not force-drained; laziness is the
  design and her privacy proof did not require them.

## Residue

The wrist-restriction unit, its supersedes edge, one assertion, and the
drained job/outcome rows remain on `voyager-dev` as ordinary bench data.
Nothing was written anywhere else.
