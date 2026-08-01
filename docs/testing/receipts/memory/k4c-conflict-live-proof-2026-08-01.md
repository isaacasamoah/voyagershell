# K4c live proof — conflict ledger on the development database

Status: `current`

Sanitization: exact hosted refs, account handles, session topology, personal
messages and claims, source ids, and operational UI logs were redacted.
Revision, counts, relation shape, verdicts, limitations, and residue remain.

This record covers the live interactive pass for the K4c conflict ledger
(`k4c-relations-rethink-2026-08-01.md` §Proof plan): migration `077` applied to
a live database, the eligibility backfill drained through real turns, and the
central conflict discovered, gated, and surfaced through the product — with the
victim's-seat privacy bar held.

## Identity

- Branch: `feature/k4c-conflict-ledger` @ `82f52c4` (review-approved rework)
- Database: authorized development target; production was never contacted
- Bench: `next dev` from this worktree; two persisted accounts on isolated
  origins, identities confirmed from `/api/voyages`, not page text
- Driven 2026-08-01 through the real browser surface
- Model path: the real per-user production resolution (not the harness lane)

## Migration 077

Applied through the owner's signed-in SQL editor in one explicit
`begin;`/`commit;` transaction. The additive transaction succeeded and the
catalog was verified by separate reads:

- `knowledge_relation_contract_active` → `relation-conflict-v2`
- `knowledge_relation_backfill_runs` → `completed:21/256` (bounded eligibility
  backfill enqueued 21 per-person jobs, marker row recorded)
- `anon` cannot execute `begin_relation_attempt` (pg_proc privilege probe)
- All 7 `knowledge_relation*` tables present

## The drain, and the judge's restraint (K4c-R4 live)

Seven real turns (private asides through the composer, badge verified armed
before every send) drained Account A's queue: **14 jobs completed, every outcome
`succeeded`, zero relation edges minted** — compatible K4b-era units co-filed
under shared topics produced no edges. Mere topical overlap never minted a
relation, live.

**A negative worth keeping:** the first attempted conflict vector compared a
private restriction belonging to Account A with a room claim about Account B
and correctly judged `none`: one person's restriction does not make another
person's activity wrong. The judge refused a conflict a careless reading would
have minted. Job `completed/succeeded/relations:0`.

## The central conflict (K4c-R1/R3 live)

Account A sent a private aside that explicitly replaced an earlier routine
claim. The private-audience badge was verified before send. The claim extracted
and its relation job drained on the next turn. Result, verified in the ledger:

- **One edge:** `[newer private claim] -[supersedes]-> [older room claim]` — correct
  verdict under Amendment 1's boundary (current state of the same commitment;
  keeping both incoherent), correct direction (newer → older)
- **One assertion row** recording the judgment's inputs — the privacy gate

## The four proofs

**1. Product surface answers "which is current?" — pass.** The Voyager's reply
to a current-state question used the newer claim and omitted the replaced
routine. The compounding moment was observed on the real surface.

**2. Account A's tool-anchored walk — pass.** The Voyager returned both claims
with source event ids from the tool result (ids retained only in owner evidence)
and named the newer claim as current.

**3. Outsider's seat — pass, the decisive one.** From Account B's own session,
its Voyager walked graph memory: **8 claims, complete and not truncated.** The
room claim was present; the private replacement, the supersedes edge, and any correction **absent** from
an explicitly complete walk — no existence, label, count, or degree leak. The
derived fact stayed as private as its private ingredient.

**4. Per-person laziness — pass.** Account B's 11 backfill jobs remain
`pending` — she took no ordinary turns; her queue drains at her next
authorized turns by design.

## Limitations, stated plainly

- The `graph_memory` claim projection does not annotate relation verdicts in
  its payload — the edge shapes reach and privacy, and the model infers
  currency from claim content. The Voyager noted the missing formal relation
  annotation while still answering correctly. Surfacing
  verdict annotations is a K5-adjacent decision, deliberately not smuggled in
  here.
- Harness P/R numbers were measured on the Codex classification lane; this
  pass exercised the real per-user model resolution live and the judgments
  were correct, but the live sample is one conflict + ~15 restraint cases,
  not a re-measurement.
- Account B's pending backfill jobs were not force-drained; laziness is the
  design and her privacy proof did not require them.

## Residue

The private replacement unit, its supersedes edge, one assertion, and the
drained job/outcome rows remain in the authorized development database as ordinary bench data.
Nothing was written anywhere else.
