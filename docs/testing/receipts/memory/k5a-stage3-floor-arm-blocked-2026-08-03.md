# K5a Stage 3 source-coupled floor-arm blocker (2026-08-03)

Status: `K5A_BLOCKED_POST_080_FLOOR_ARM`

Follow-up: Bridge Prime ruled this as the expected G8 timing-envelope movement,
not a search-design failure, and requested the clean curve recorded in
`k5a-g8-post-findability-curve-2026-08-03.md`. This receipt remains the durable
evidence that caused that measurement; its stop was correct at the time.

Branch: `feature/k5a-graph-memory`

Checkpoint base: `5b340da`

## Decision served

Migration 080 is ready only if the post-G8 search implementation preserves the
confirmed observable boundary. The permanent under-floor arm reads
`RESPONSE_FLOOR_MS` from `boundary.ts`, subtracts the measured boundary overhead
from the sealed floor receipt, and must keep the 1,500-unit exact database read
strictly below the resulting budget. A failure stops 081 authoring.

## Candidate proved

The uncommitted candidate authors 080 as one atomic transaction:

- backfills only already-eligible user `conversation` and `message` source
  events under the still-active v4 extractor;
- preserves a durable drain marker and refuses to mark an incomplete drain;
- replaces `knowledge_units_audience_lookup` and all three search paths in the
  same transaction;
- removes the birth-attention/effective-attention eligibility filters and the
  semantic retirement exclusion while retaining every physics-completeness
  `IS NOT NULL` guard;
- leaves the graph read's default-reach predicate unchanged;
- keeps C5 coverage and v5 activation absent; and
- adds a database return-field seam for viewer-relative retirement marking,
  while deliberately leaving the application result shape unchanged pending
  G10. A G10 decision can therefore expose or ignore the already-versioned
  field without re-cutting 080.

No migration was applied to a live database. Proof used the pinned, local,
no-network pgvector container and replayed 080 twice.

## Passing evidence

The ordinary post-080 run completed with
`CARTOGRAPHER_K5A_C3_LOCAL_GREEN`. It proved the full unconstrained C3 call
path at both ruled scales and all C4 recall, plan, bounded-read,
corpus-independence, and strengthened findability bars. The findability
falsifier includes authorized units with `attention_score = 0` and
viewer-relative retirement and proves all semantic, keyword, anchored,
temporal, and exact-ID paths return them without foreign disclosure.

Focused structural tests passed: 24/24 across the G8, Stage 2, Stage 3, and
retrieval contract suites. Shell syntax, changed-file size, and diff checks
also passed before the timing arm.

## Failing evidence

The source-coupled values were read, not copied:

```text
RESPONSE_FLOOR_MS from boundary.ts        556.000 ms
boundary overhead from sealed receipt       3.256 ms
database-work ceiling                     552.744 ms
G5 exact authorized-set horizon             1,500 units
```

The first clean post-080 run failed with:

```text
k5a_floor_supported_pair_over_database_budget:552.744:559.12
```

The instrument was then changed only to emit the complete paired evidence
before its unchanged hard assertion. The one diagnostic rerun produced:

| Pair | Foreign authorized before -> after | Before p95 (ms) | After p95 (ms) |
| ---: | ---: | ---: | ---: |
| 1 | 0 -> 1,500 | 528.587 | 534.009 |
| 2 | 1,500 -> 3,000 | 524.141 | **553.115** |
| 3 | 3,000 -> 4,500 | **562.794** | 532.600 |
| 4 | 4,500 -> 6,000 | 524.414 | 548.833 |
| 5 | 6,000 -> 7,500 | 551.260 | 541.288 |

The rerun failed with:

```text
k5a_floor_supported_pair_over_database_budget:552.744:562.794
```

Two of ten paired p95 observations exceeded the budget. The first exceeded it
by 0.371 ms; the second by 10.050 ms. The preceding C4 diagnostic also showed
a 1,500-unit p95 of 763.643 ms during this noisier run, while its exact recall,
named access paths, authorized row count, zero rows removed, result identity,
and foreign-growth mechanism assertions all continued to pass.

## Verdict and stop

`RESPONSE_FLOOR_MS=556` is not proved for the post-080 candidate by its ruled,
source-coupled arm. The failure repeated without changing the product query or
the bar. No third timing run, query knob, planner forcing, weakened assertion,
081 migration, live database change, C5 widening, or v5 activation was
attempted.

The next decision belongs to Spec/Isaac: re-adjudicate the observable floor,
the supported exact horizon, or the retirement-marking seam using these
post-080 measurements. Until then, 080 remains a committed migration file but
is blocked from the cutover path, and 081 remains un-authored.
