# K5a C4 vector authorization — blocked pending Spec R4 (2026-08-02)

Status: `BLOCKED-PENDING-SPEC R4`

Checkpoint: `ae8d666` on `feature/k5a-graph-memory`

This receipt is a blocking handoff, not a passing proof. Do not merge, release,
or describe K5a Stage 2 as complete from this checkpoint.

## Decision this evidence settles

The approved C4 design assumed that semantic search could reuse the existing
global HNSW index while applying the graph's per-viewer grant predicate. The
production query also has to bound effective-attention work before it reaches
the viewer's whole authorized corpus.

The local production-shape proof disproved that assumption as a stable design.
At default HNSW search effort, PostgreSQL used the bounded HNSW path but one run
missed the exact owner-authorized nearest unit. Raising `hnsw.ef_search` to 200
restored that result, but changed the chosen plan to a primary-key index scan of
the corpus followed by a top-N vector sort. That unbounded shape repeated.

Per the implementer stop rule, the second repeated unbounded plan ended the
correction loop. Choosing between forced approximate search, a new authorized
vector-access design, or explicitly accepting corpus-proportional work belongs
to Spec R4.

## Sanitized setup

`recipes/cartographer-k5a-c3-local-proof.sh` created a disposable pinned
pgvector PostgreSQL container with networking disabled. Migration 079 was
applied twice before the assertions. The C4 corpus contained:

- one owner-only target whose 1,536-dimensional vector exactly matched the
  query;
- 1,000 owner-only authorized filler units with orthogonal vectors;
- the existing synthetic K3/K4/K5a fixtures;
- a victim profile outside the target and filler audience.

No hosted identifier, credential, personal corpus, or live database was read or
written.

## Three observed plan executions

The excerpts below omit the 1,536 vector coordinates while retaining the
decision-bearing fields from `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.

### 1. Default effort: bounded HNSW plan, exact owner hit missed

The plan used the intended vector index and stopped at forty candidates:

```json
{
  "Node Type": "Index Scan",
  "Index Name": "knowledge_units_embedding_hnsw",
  "Actual Rows": 40,
  "Shared Hit Blocks": 1489,
  "Actual Total Time": 3.126
}
```

The enclosing limit reported 1,610 shared-hit blocks and 3.199 ms total
execution. The victim's semantic result was byte-identical `[]`, as required,
but the owner's semantic result was also `[]`. In the same assertion the owner
received the exact unit through keyword and exact-id reads. A preceding isolated
run on the same shaped fixture had returned the semantic target, so the default
HNSW result was not stable across fresh index builds.

### 2. `hnsw.ef_search = 200`: recall restored, bounded plan lost

The first corrective attempt increased HNSW search effort to the same 200-unit
ceiling used by the production candidate budget. The owner semantic result was
restored, but the planner no longer used HNSW:

```json
{
  "Node Type": "Index Scan",
  "Index Name": "knowledge_units_pkey",
  "Actual Rows": 1048,
  "Rows Removed by Filter": 21,
  "Shared Hit Blocks": 37358,
  "Actual Total Time": 83.831
}
```

The subsequent anti-join and top-N sort brought the enclosing limit to 40,503
shared-hit blocks and 86.722 ms total execution. `enable_seqscan = off` did not
prevent this shape because a primary-key index scan plus sort remained legal.

### 3. Repeated `ef_search = 200`: same corpus scan and sort

A fresh disposable database repeated the correction attempt. The owner result
again returned, but the physical plan again scanned by primary key and sorted
the authorized corpus:

```json
{
  "Scan Index": "knowledge_units_pkey",
  "Sort Method": "top-N heapsort",
  "Limit Actual Rows": 40,
  "Limit Shared Hit Blocks": 40501,
  "Limit Actual Total Time": 86.854,
  "Execution Time": 86.862
}
```

This second occurrence established the blocker. More statistics tuning or a
third planner toggle could not answer the product decision about approximate
recall, authorization filtering, and bounded work.

## Corrective attempts and stop point

1. The first reviewed implementation authorized and materialized every
   embedded unit before effective-attention ranking. Independent Build Review
   correctly rejected it as `O(authorized corpus × attention lookups)`.
2. The query was re-derived as a bounded nearest-neighbor stage, oversampling at
   four times the requested count with a hard maximum of 200, followed by
   effective attention. A 1,001-unit plan assertion proved HNSW use. Independent
   re-review returned `CLEAN`, but the next full-suite run exposed the default
   HNSW recall miss above.
3. Increasing `hnsw.ef_search` to 200 restored the exact result but produced the
   86 ms primary-key scan and sort twice. The repeated unbounded-plan constraint
   stopped the run. The experimental search-effort change was removed before
   checkpoint commit `ae8d666`.

The C4 battery remains deliberately capable of failing on either side of the
contradiction: the victim/owner assertions catch recall loss, and the plan
assertion catches abandonment of the HNSW path. It must not be weakened merely
to make the suite green.

## R4 options

### A — force the current HNSW shape

Disable sort at the function boundary so the planner must use HNSW, and choose
a fixed HNSW effort/candidate budget. This is the smallest Stage 2 change, but
it makes approximate recall and global-index filtering part of the product
contract. R4 would need to rule what missed authorized results mean and prove
that hidden, closer vectors cannot create an unacceptable result or timing
signal.

### B — design authorization into vector access (recommended)

Return C4 semantic search to Spec and design a vector access path whose physical
partition already matches durable graph authorization, rather than filtering a
global ANN index at read time. This preserves both truthful authorization and a
bounded search shape, but it is a schema/design change and should not be
invented inside Build.

### C — accept corpus-proportional vector work explicitly

Keep effective-attention calculations behind the 200-candidate boundary but
allow PostgreSQL to scan and sort the authorized corpus to derive those
candidates. This produces exact filtering semantics and restored recall, but
the vector stage remains `O(corpus)` and the observed block growth makes future
latency a stated product cost, not an implementation detail.

## State of the rest of Stage 2

Before the vector stress probe was added, the full local suite reached
`FULL_SUITE_GREEN` with 94 files and 486 tests; TypeScript checking and the
production build also passed. Independent re-review found the standing-delivery
closure, exact hydration, selecting read, and non-vector search corrections
clean. Those earlier green results do not overrule this later C4 falsifier.

The final attempted full suite passed K3, K4a, K4b, and K4c, then stopped in the
K5a C3/C4 battery on the vector contradiction. C1/C2's 8,000-session bounded
window, production v3 selection/annotation/repair, keyword search, anchored
search, time search, exact-id hydration, search/reach citations, and the C4
victim-seat non-vector probes remain locally proved. C5, migration 080,
migration 081, hosted composer latency, hosted databases, and release were not
touched.

## Commands

```bash
./recipes/cartographer-k5a-c3-local-proof.sh
./recipes/full-suite.sh
npm run type-check
npm run build
```

The first two commands are expected to remain blocked at C4 until R4 rules a
vector authorization design. A green result from HNSW randomness alone is not
sufficient evidence to lift this block.
