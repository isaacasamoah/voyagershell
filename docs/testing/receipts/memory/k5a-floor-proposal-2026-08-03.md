# K5a G6 floor and G5 threshold proposal (2026-08-03)

Status: `FLOOR_PROPOSAL_AWAITING_CONFIRMATION`

Base revision: `c598c44256afb291b1e1971384edcb826ed59349` on
`feature/k5a-graph-memory`.

Proposed `RESPONSE_FLOOR_MS`: **556 ms**.

Proposed G5 exact-recall threshold: **exact authorized-subset search is the
promise through 1,500 authorized units. Above 1,500 units, the authorized-
partition ANN design returns to its gate; approximate results do not begin
automatically.**

`lib/knowledge/kernel/boundary.ts` still says 550 ms at this proposal revision.
Neither the product-visible floor nor the source-coupled under-floor battery
arm changes until Isaac confirms the number.

## Measurement boundary

The database run used the pinned pgvector image in the same disposable,
no-network harness as C3/C4. The ordinary R7 bars ran first. The clean curve
then used warm calls to production `search_knowledge_units`, 20 observations per
point, without `EXPLAIN`; five A/B p95 pairs ran in one session at the supported
scale. No hosted service, live database, credential, or personal corpus was
read.

The application-boundary run exercised the real `boundary.ts` parser and
floor, real Supabase auth/RPC clients, and loopback HTTP shaped as GoTrue and
PostgREST. It intentionally omitted database execution so its 30 observations
measure only auth, candidate-client acquisition, transport/SDK decoding, and
the boundary parser. This is local boundary overhead, not a hosted-network
claim. Database execution and boundary overhead are added rather than
double-counted.

## Clean database curve

| Authorized units | Warm p95 (ms) |
| ---------------: | ------------: |
| 100              |        42.240 |
| 500              |       202.621 |
| 1,001            |       390.941 |
| 1,200            |       463.883 |
| 1,300            |       484.606 |
| 1,400            |       491.041 |
| 1,500            |       529.556 |
| 1,600            |       559.447 |

The non-monotonic 1,300/1,400 observations are why the threshold is a measured
bracket rather than an interpolated line. 1,500 is the largest measured scale
whose clean p95 remains under the existing 550 ms database-work horizon;
1,600 is the first measured point above it.

At 1,500 units, each same-session pair measured the fixed viewer subset,
inserted exactly 1,500 newly authorized units for a foreign viewer, then
measured the fixed subset again:

| Pair | Foreign before → after | Before p95 (ms) | After p95 (ms) | Absolute delta (ms) |
| ---: | ---------------------: | --------------: | -------------: | ------------------: |
| 1    |             0 → 1,500 |         522.173 |        519.422 |               2.751 |
| 2    |         1,500 → 3,000 |         535.991 |        522.210 |              13.781 |
| 3    |         3,000 → 4,500 |         531.788 |        534.824 |               3.036 |
| 4    |         4,500 → 6,000 |         534.078 |        521.281 |              12.797 |
| 5    |         6,000 → 7,500 |         533.918 |        534.638 |               0.720 |

The supported-scale mean across all before/after values was 529.032 ms, sample
standard deviation 6.802 ms, maximum 535.991 ms, and p95 absolute foreign-growth
pair delta 13.781 ms. The across-value standard deviation is descriptive; it is
not the database margin input.

This directly adjudicates the standing 0.65 ms foreign-growth observation. One
paired replay produced 0.720 ms, while the measured pair-delta p95 was 13.781
ms. The proposal uses that paired-delta p95 as its database margin; it does not
compare an after sample to a one-sided envelope derived from unrelated runs.

## Measured boundary overhead

Thirty steady-state samples, after one cold and five warm-up calls, produced:

| Phase | p95 (ms) |
| --- | ---: |
| Auth, including local GoTrue HTTP | 2.139 |
| Candidate client acquisition | 0.011 |
| RPC transport and SDK JSON decode | 1.530 |
| Boundary envelope/claim parse | 0.024 |
| Per-sample phase sum | **3.256** |

The phase-sum sample standard deviation was 0.689 ms. Cold candidate-client
acquisition was 0.216 ms. With the current 550 ms floor, observable total p95
was 552.222 ms; timer overshoot is recorded but does not consume the pre-floor
database budget.

## Derivation

The formula uses the highest supported-scale paired p95, the measured boundary
p95, the p95 same-session foreign-growth delta as database margin, and three
boundary standard deviations as timer/transport jitter margin:

```text
database paired margin = 13.781 ms
boundary jitter margin = 3 * 0.689 = 2.067 ms
total margin           = 15.848 ms
floor raw              = 535.991 + 3.256 + 15.848
                       = 555.095 ms
floor integer          = ceil(555.095) = 556 ms
```

After confirmation, the source-coupled database arm will read the 556 ms floor
from `boundary.ts` and subtract the measured 3.256 ms boundary p95, giving a
552.744 ms database-work ceiling. It will not copy either the old 550 literal
or an independently chosen allowance.

Machine-readable receipt:
`k5a-floor-measurement-2026-08-03.json`.

## Verification markers

```text
K5A_FLOOR_BOUNDARY_MEASUREMENT
CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN
CARTOGRAPHER_K5A_C3_LOCAL_GREEN
```
