# K5a C4 vector authorization — R4 plan-stability blocker (2026-08-02)

Status: `BLOCKED-R4-PLAN-STABILITY`

Prior clean Stage-2 checkpoint: `ae8d666`. R4 blocker checkpoint: this
receipt's commit on `feature/k5a-graph-memory`.

This receipt is a blocking handoff, not a passing proof. Spec R4 has now ruled
the vector-access design, but the re-PoC did not pass all four C4 bars. Do not
merge, release, or describe K5a Stage 2 as complete from this branch.

## R4 provenance reconciliation

The amendment's provenance note and the original observations below agree; no
numeric or semantic divergence was found before the R4 implementation began:

- default HNSW effort returned forty candidates and missed the exact authorized
  target;
- `hnsw.ef_search = 200` restored that target but selected a primary-key scan
  and top-N sort over 1,048 rows, with 40,503 shared-hit blocks and 86.722 ms at
  the enclosing limit;
- a fresh database repeated the same primary-key-and-sort shape with 40,501
  shared-hit blocks and 86.862 ms total execution.

R4 adopted option D: compute exact vector distance over exactly the authorized
subset, enumerate that subset through the audience-membership and
unit-to-audience indexes, use no planner forcing, retain migration 076's HNSW
index only for K4b topic blocking, and leave iterative scan behind a measured
scale gate. G5 remained a raised product question and did not block the battery.

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

The first two commands remain blocked at C4. A green result requires all four
R4 bars; exact recall or stable latency alone cannot lift this block.

## R4 re-PoC and second stop point

The R4 candidate adds a GIN lookup on
`knowledge_audiences.member_profile_ids` and a partial B-tree membership index
on searchable `knowledge_units(knowledge_audience_id, id)`. Semantic search
enumerates authorized unit IDs through those indexes, hydrates each authorized
unit by primary key, and only then computes exact vector distance. The semantic
function contains no planner GUC, HNSW reference, `ef_search`, or
`iterative_scan` setting. The disposable battery uses 8,192 nonmatching
audiences so the GIN access is a real planner choice and a 20,000-row
non-searchable backdrop so small-table sequential plans cannot masquerade as
the intended membership path.

Three R4 executions were observed:

1. The direct authorized join returned the exact target at 100, 1,001, and the
   measured threshold, but the unit membership path changed from an index scan
   at 100 to bitmap access at 1,001. The derived threshold was 1,974 authorized
   units; the three `EXPLAIN ANALYZE` executions were 32.448 ms, 289.788 ms,
   and 541.231 ms. The plan-stability bar failed.
2. The first correction made the audience GIN choice real and used an ordered
   lateral unit enumeration. The GIN lookup held, but the unit path changed
   from sequential access at 100 to bitmap access at 1,001 and at the derived
   1,881-unit threshold. The three plan executions were 32.495 ms, 279.349 ms,
   and 533.042 ms. The plan-stability bar failed again.
3. The second correction split membership enumeration from primary-key
   hydration and narrowed the unit membership index to searchable rows. Exact
   recall passed and the same two named membership indexes and plan signature
   held at 100, 1,001, and the derived threshold. With the owner's authorized
   set fixed at 1,001 units, the foreign authorized set then grew exactly 10x.
   The owner's result remained byte-identical and p95 remained materially
   unchanged, from 371.889 ms to 368.091 ms. PostgreSQL nevertheless reordered
   the event-primary-key `Memoize` node and retirement `Materialize` node. The
   required plan identity therefore failed even though results and latency did
   not.

That is the same material plan-stability failure after two corrective attempts.
The implementer stopped without adding a planner toggle, disguising the plan
change in the signature, weakening the bar, or proceeding to full-suite and
independent final review. The unresolved decision is whether R4 means literal
identity of every downstream executor node, or stability of the authorized-set
membership access path plus corpus-independent results and latency. Build must
not decide that semantic amendment itself.
