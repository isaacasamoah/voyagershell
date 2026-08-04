# K5a Round 5 kernel no-forcing reproof — blocked (2026-08-02)

Status: `SUPERSEDED-R5-C3-NON-ENUMERATION-BLOCKER`

Round 6 resolved this historical blocker with the ruled two-regime bar, and R7
then replaced that bar's single-shape coverage and reclassified its physical
read evidence. The GUC-free production query's current observable and
design-integrity evidence is in
`k5a-r7-battery-corrections-2026-08-03.md`. The observations below remain the
evidence that caused the return to Spec; they are not the current verdict.

Base checkpoint: `256ad6095a3cea0b1f1e942d1299358d152751e4` on
`feature/k5a-graph-memory`.

At its checkpoint, this was a blocking handoff rather than a passing proof, so
that revision was not to be merged, released, or described as K5a Stage 2
complete. Round 6 replaced that checkpoint verdict; the current R7 proof is
linked above.

## Decision this evidence settles

Round 5 ruled that no memory-kernel read may carry a function or session
planner GUC. It specifically required removing `enable_seqscan = off` and
`enable_bitmapscan = off` from `retrieve_knowledge_graph_claims_v3`, then
re-running every C3 bar. Any degradation was a return to Spec rather than an
invitation to add query structure or another knob.

The no-forcing reproof degraded at C3's load-bearing mechanism: the viewer's
own annotation lookup became a sequential scan and enumerated foreign
annotation rows. The implementer stopped on that first observation. Output and
wall-clock stability cannot overrule the mechanism failure because the claim
requires the foreign partition never to be read.

## Required unchanged C4 run

Before any source edit, the Round 4 candidate at `256ad609` was re-run exactly
as checkpointed. It reproduced the evidence Round 5 amended:

- owner result before and after 10x foreign growth was byte-identical;
- owner p95 moved from 355.837 ms to 364.273 ms;
- the named audience-membership, unit-membership, unit-primary-key,
  event-primary-key, and retirement paths remained present;
- only the interior event `Memoize` and retirement `Materialize` placement
  changed.

The old literal-plan assertion fired, as expected. That run made no repository
change and confirms that Round 5 addressed the observed C4 falsifier.

## No-forcing change

The attempted reproof removed all six C3 planner-forcing clauses:

- function-level `SET enable_seqscan = off` and
  `SET enable_bitmapscan = off` from production
  `retrieve_knowledge_graph_claims_v3`;
- the same two clauses from the disposable selecting-read PoC;
- the matching `SET LOCAL` statements from the C3 assertion transaction.

The Stage-2 structural test was inverted to reject planner forcing and passed:

```text
npx vitest run lib/agents/cartographer/k5a-stage2.contract.test.ts
Test Files  1 passed (1)
Tests       5 passed (5)
```

That structural result is not mechanism evidence. The disposable PostgreSQL
run below is.

## C3 degradation

Command:

```bash
./recipes/cartographer-k5a-c3-local-proof.sh
```

The run applied migration 079 twice and advanced through the selecting-read
output, own-degree overflow, and bounded chain assertions. It failed at
`k5a_c3_foreign_degree_independence_failed` before the revised C4 battery ran.

The same own-row query was explained before and after adding 128 foreign-person
annotation rows. In both plans PostgreSQL selected:

```text
Relation: knowledge_relation_annotation_index
Node Type: Seq Scan
Actual Rows: 1
Index Name: none
```

The mechanism changed with foreign degree:

| Executed-plan field | Before | After 128 foreign rows |
|---|---:|---:|
| Rows Removed by Filter | 33 | 289 |
| Shared Hit Blocks | 1 | 7 |
| Execution Time | 0.005 ms | 0.012 ms |

The lookup returned one viewer-owned row in both cases, but read 256 additional
filtered rows after the foreign growth. That is enumeration of the foreign
partition, not an index seek into the viewer's own partition. The fifty-lookup
timings were 0.000205 s and 0.000491 s; complete-reader timings were 0.156476 s
and 0.166053 s. Those remained below the existing envelope, but the output
identity assertion was not reached because the mechanism assertion failed
first. The foreign read is sufficient to violate C3 non-enumeration and
degree-independence.

## Stop point and unproved work

No query fence, `MATERIALIZED` CTE, rewritten lookup, fixture inflation, or
planner setting was added after the failure. Choosing a no-forcing structure
that preserves own-partition non-enumeration is now a Spec decision under the
explicit Round 5 stop rule.

The Round 5 C4 assertion rewrite exists in this blocker checkpoint but was not
executed because C3 stopped the combined battery first. It directly inspects
row-source identity, named access paths, primary-key unit rows read, and rows
removed by filtering; it derives the timing envelope from five unchanged-corpus
p95 runs using three sample standard deviations; it records the instrumented
cost curve with `g5_ann_threshold_units = null`. It is resume material, not a
green receipt.

The full suite, TypeScript check, production build, and final independent
re-review were not run after this failure because none can change the required
return-to-Spec decision.
