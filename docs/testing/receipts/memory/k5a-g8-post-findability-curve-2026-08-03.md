# K5a G8 post-findability timing curve (2026-08-03)

Status: `K5A_G8_CURVE_MEASURED`

Candidate: `20f40280b04c911d4ef076e3c774e68fe241bf5c`

## Result

The two measured levers are:

1. **Keep the 1,500-unit exact horizon: raise `RESPONSE_FLOOR_MS` to 598 ms.**
2. **Keep `RESPONSE_FLOOR_MS=556`: use 1,400 units as the largest measured
   exact horizon.** Its fully derived envelope is 539.547 ms; the next measured
   point, 1,500, is 597.549 ms.

These are timing-envelope choices, not query repairs. The same 080 candidate
passed every C3/C4 recall, plan, bounded-read, corpus-independence, and
zeroed/retired findability bar before this clean measurement. Neither the query
nor a bar was changed.

## Method

The pinned pgvector image ran in a disposable, no-network container. Nothing
was applied to a live database. The instrument measured fully searchable
authorized sets: every unit had complete physics fields, and neither zero
attention nor viewer-relative retirement was excluded from the search promise.

At each scale it took ten same-session A/B pairs. Each p95 comprised twenty
warm, uninstrumented exact searches. Each pair measured a fixed viewer set,
added one whole authorized-set cardinality for a foreign viewer, analyzed the
table, then measured the fixed set again. Ten pairs therefore reached exactly
10x foreign growth at each scale. In total this was 160 p95 draws and 3,200
timed exact reads, plus excluded warm-ups. No `EXPLAIN`, planner GUC, ANN knob,
or retry entered the timing path.

The envelope at each scale is:

```text
worst measured p95
+ sealed boundary overhead (3.256 ms)
+ p95 same-session paired delta
+ 3 * sealed boundary jitter standard deviation (3 * 0.689 = 2.067 ms)
```

With ten paired deltas, `percentile_disc(0.95)` is the largest observed delta,
so the paired margin is conservative rather than an average.

## Curve

| Authorized units | Worst p95 (ms) | Paired margin p95 (ms) | Overhead (ms) | 3-sigma jitter (ms) | Derived envelope (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 39.995 | 2.601 | 3.256 | 2.067 | 47.919 |
| 500 | 185.725 | 4.387 | 3.256 | 2.067 | 195.435 |
| 1,000 | 414.167 | 28.718 | 3.256 | 2.067 | 448.208 |
| 1,200 | 456.560 | 12.190 | 3.256 | 2.067 | 474.073 |
| 1,300 | 497.731 | 22.792 | 3.256 | 2.067 | 525.846 |
| **1,400** | **519.039** | **15.185** | **3.256** | **2.067** | **539.547** |
| **1,500** | **567.728** | **24.498** | **3.256** | **2.067** | **597.549** |
| 2,000 | 800.034 | 38.958 | 3.256 | 2.067 | 844.315 |

The required 100/500/1,000/1,500/2,000 points are present. The 1,200/1,300/
1,400 points locate the current-floor bracket without interpolation. The
reported 1,400 horizon is the largest measured scale whose complete derivation
fits 556; no claim is made that the physical crossover occurs on that exact
unit boundary.

## 1,500-unit derivation

The ten before/after p95 pairs were:

| Pair | Foreign before -> after | Before (ms) | After (ms) | Delta (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0 -> 1,500 | 537.934 | 552.523 | 14.589 |
| 2 | 1,500 -> 3,000 | 547.606 | 538.141 | 9.465 |
| 3 | 3,000 -> 4,500 | 546.963 | 543.620 | 3.343 |
| 4 | 4,500 -> 6,000 | 545.975 | 548.020 | 2.045 |
| 5 | 6,000 -> 7,500 | 544.334 | 549.286 | 4.952 |
| 6 | 7,500 -> 9,000 | 556.329 | 547.242 | 9.087 |
| 7 | 9,000 -> 10,500 | 545.805 | 561.021 | 15.216 |
| 8 | 10,500 -> 12,000 | 547.201 | 546.898 | 0.303 |
| 9 | 12,000 -> 13,500 | 551.338 | 560.016 | 8.678 |
| 10 | 13,500 -> 15,000 | 543.230 | 567.728 | 24.498 |

```text
worst measured 1,500-unit p95       567.728 ms
sealed boundary overhead              3.256 ms
paired same-session p95 margin        24.498 ms
sealed 3-sigma boundary jitter         2.067 ms
raw derived floor                    597.549 ms
integer product floor               ceil(...) = 598 ms
```

The machine-readable companion receipt preserves every scale's ten paired
deltas and the complete 1,500-unit before/after table. The harness source is
`recipes/sql/cartographer-k5a-g8-curve.sql`.

## Stop

This is measurement only. Migration 081 remains un-authored, migration 080 was
not applied live, and `RESPONSE_FLOOR_MS` remains 556 pending Isaac's lever
choice.
