# K3 Cartographer — interactive proof against the development database

Status: `limited`

Sanitization: account handles, exact hosted refs, session topology, personal
messages, and durable object identifiers were redacted. Revisions, counts,
timing, proof shapes, verdicts, limitations, and residue are retained.

This record covers the production-shaped proof the 2026-07-26 evidence record
named as still required. It is not a release, a deployment, or a product Test
Gate.

## Identity

- Branch: `feature/k3-cartographer-poc`
- Revision proved: `9b3b57c` (structural slice inherited from `78b3da6`)
- Database: authorized development target; production was never contacted
- Bench: `next dev` from this worktree with owner-only environment configuration
- Migration `072` applied 2026-07-27 through the owner's signed-in Supabase SQL
  editor, wrapped in one explicit transaction. Verified after application:
  4/4 tables, 4/4 functions, active contract `cartographer-single-claim-v1`,
  enqueue trigger present, RLS on all four tables, and `write_knowledge_graph_edge`
  absent. `knowledge_extraction_jobs` held 0 rows, confirming history was not
  replayed.

The available Management API credential returned `401` to project and
organization discovery. The credential value and location remain owner-only.

## How it was driven

Two real accounts, two isolated origins, one browser:

| Account | Origin | Role |
|---|---|---|
| Account A | redacted isolated origin | captain, 6 voyages |
| Account B | redacted isolated origin | crew, one shared voyage |

Distinct origins give distinct `localStorage`, so the two Supabase sessions do
not collide. Identity was confirmed per account from `/api/voyages` rather than
from page text, and the origin was re-verified immediately before every action
because the automation target has silently drifted between tabs in this harness.

## What was typed

Three ordinary sentences, typed into the real composer. No seeded rows, no
"remember" command, no fixture insert.

1. Account A sent one ordinary interpersonal fact to the room.
2. Account A sent one personal preference as a private aside.
3. Account A sent one ordinary place preference to the room.

## Observed result — the central claim

The first sentence produced, with no further action:

| Object | Value |
|---|---|
| Source event | redacted id, `message` / `user`, 09:13:41.391Z |
| Job | created 09:13:41.424Z — 33 ms later, inside the ingress transaction |
| Attempt | redacted id, number 1, provider `openai.responses`, model `gpt-5.5` |
| Outcome | `succeeded`, 09:13:47.276Z |
| Unit | redacted id, claim_key `claim:0`, room audience |
| `derived_from` | one edge to the exact message-event node |
| `about` | one edge to Account B's canonical Person node |
| Unit grant | room audience, basis `source_event` = the exact source event |
| Person endpoint grant | same audience, basis `edge_evidence` = the `about` edge, basis_event = the source event |
| Edge evidence | both edges cite the exact source event |

End to end, off the response path, in about six seconds.

## Claim-by-claim

| Claim | Result | Evidence |
|---|---|---|
| K3-C1 every new human source becomes eligible | **pass** | Four events were written. Room `message`/`user` → job. Private `conversation`/`user` → job. `explicit`/`user` (audience null) → no job. Voyager-authored `conversation`/`voyager` → **no job**. Exactly two jobs for the two human events. The room path passed with no Voyager response and no `finishTurn`. |
| K3-C2 one source produces zero or one immutable claim | **pass** | One unit per source event, derived from the immutable `knowledge_events` row. No `knowledge_current` read participates. Not falsified by deleting the projection row — see limitations. |
| K3-C3 provenance is exact and audience-bound | **pass, with a limitation** | Attempt records extractor version, concrete provider `openai.responses`, concrete model `gpt-5.5`, and the exact source audience. One separate immutable outcome carries raw output and terminal result. Token counts are not observable from this provider — see limitation 1. |
| K3-C4 retries are safe | **pass** | Replaying the identical completion returned `replayed=true` with the same `unit_id` and wrote no new rows. Re-leasing the completed job returned zero rows. Counts stayed 1/1/1/1 and the claim stayed byte-identical. |
| K3-C5 scope never widens | **pass** | Two units inherited two different audiences: the shared room audience and Account A's private audience. The `about` target belongs to the source audience, so the model chose from the supplied candidate set. Audience is derived in PostgreSQL; no caller supplies it. |
| K3-C6 one source-backed interpersonal fragment is complete | **pass** | The exact delta above: one attempt, one outcome, one unit, one unit node, one source-audience grant, one `derived_from`, one `about`, both evidence rows, and the endpoint grant needed for traversal. Extraction produced no structural edge — the `authored_by`/`posted_in` increments come from K2 ingress of the message itself. |
| K3-C7 no outcome is silent | **partial** | Success and no-claim are distinguishable in stored state, and a conflicting payload was rejected with `23505` leaving the unit unmutated. Provider failure, malformed output and expiry were **not** exercised against the live branch — see limitation 2. |

## Denial probes

Against the live development branch, using the `anon` key:

- `knowledge_extractor_contracts`, `knowledge_extraction_jobs`,
  `knowledge_extraction_attempts`, `knowledge_extraction_attempt_outcomes`,
  `knowledge_units`, `graph_nodes`, `graph_edges`, `graph_edge_evidence` — all
  `42501 permission denied`
- `begin_knowledge_extraction_attempt` and
  `complete_knowledge_extraction_attempt` with full named arguments — both
  `42501 permission denied for function`
- direct `graph_edges` insert — `42501`
- `knowledge_events` — `200` returning `[]`; RLS leaked no row
- `write_knowledge_graph_edge` — absent from the schema cache

Control: `service_role` reads the unit, proving the probes targeted live rows.

## Experienced behaviour

- The room message appeared for both accounts as the final item; nothing
  followed it.
- No public Voyager reply and no Cartographer output appeared in either feed.
  Extraction is invisible to the room, as intended.
- No console errors on either origin.

## Limitations

1. **Token use is unobservable for the configured provider, and metered cost
   is therefore unavailable.** The router resolved to `openai.responses` /
   `gpt-5.5`, which returned no usage. The first two attempts recorded `0`
   input and output tokens because the extractor coerced the missing values.
   That asserted the call consumed nothing, which is untrue. Fixed in `9b3b57c`:
   unknown usage now stores `null`, proved live on the third event. Metered
   cost likewise reports null rather than a confident zero, because only
   Anthropic rates are known to this build. The consequence stands: the spec's
   per-event cost formula cannot be evaluated for the provider the system
   actually selects.
2. **Three K3-C7 outcome kinds were not driven on the live branch**:
   `provider_failed`, `malformed_output`, and lease expiry. They are covered by
   the disposable-Postgres recipe and the offline suite at this revision, and
   the completion function's branches for them are unchanged from the reviewed
   migration. Driving them live would need provider fault injection, which
   cannot change the Spec Gate decision.
3. The `knowledge_current` projection-deletion falsification for K3-C2 was run
   against disposable Postgres, not the live branch. The live path demonstrably
   reads only `knowledge_events` — the extractor receives its source content
   from `begin_knowledge_extraction_attempt`, which joins `knowledge_events`
   alone.

## Residue

Spec residue searches at this revision return zero live paths for
`ENRICHMENT_THRESHOLD`, `shouldRunEnrichment`, the `knowledge_type` queue
sentinel, `.neq('event_type', 'message')`, Stage 2, and any Cartographer cron.
`source.ts` and `stage2.ts` are absent from the tree. `write_knowledge_graph_edge`
survives only as the `DROP` in migration `072` and as a negative assertion in
`database.contract.test.ts`.

Remaining `knowledge_type` references belong to the mutable `knowledge_current`
enrichment surface, which the spec explicitly retains until K5.

## Automated checks at `9b3b57c`

| Check | Outcome |
|---|---|
| `npm run test:run` | 68 files, 371 tests passed |
| `npm run type-check` | passed |
| `npm run build` | passed |
| `git diff --check` | clean |
| changed-file line cap | every file at or below 249 lines |

## Data left behind

Three source events, three jobs, three attempts, three outcomes, three units
and six new edges remain in the authorized development database. They are
ordinary room and private content and were deliberately not
deleted: `knowledge_events` is append-only and the extraction tables are
immutable by trigger, so removing them would mean defeating the guards this
work exists to prove.
