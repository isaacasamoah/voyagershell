# K5a G8 birth-zero measurement — 2026-08-03

Status: `K5A-BIRTHZERO-GREEN`

## Decision

The canonical bench corpus contained **0 birth-zero units among 45,044
knowledge units**, a fraction of **0%**. This is below the approximately 0.17%
headroom threshold derived by G8, so `RESPONSE_FLOOR_MS = 556` and the G5 exact
authorized-subset horizon of 1,500 units stand confirmed.

The measured authorized subsets do not widen:

| Bench viewer | Positive-birth subset | Birth-zero units | Whole complete subset |
|---|---:|---:|---:|
| curve | 1,600 | 0 | 1,600 |
| supported | 1,500 | 0 | 1,500 |
| foreign | 7,500 | 0 | 7,500 |

Zero units **today** does not make the class impossible. The schema permits
`attention_score = 0`: its check is `BETWEEN 0 AND 1`, the extractor schema has
the same inclusive range, and nothing floors model output above zero. G8 removes
a legal possibility from the findability boundary, not a currently populated
class. The floor's durable definition is therefore the worst read over the
**whole authorized set**, not the current attention-positive subset; that keeps
the floor valid if the extractor's output distribution later shifts.

## Measurement

Command:

```text
K5A_FLOOR_MEASUREMENT=1 ./recipes/cartographer-k5a-c3-local-proof.sh
```

The existing pinned, no-network disposable harness reconstructed the canonical
floor bench. The committed floor recipe emits the G8 measurement from a
read-only `SELECT`:
`count(*) FILTER (WHERE attention_score = 0)` over `count(*)`, plus the three
named viewer subsets with every physics-completeness guard retained. No hosted
or live database was read or written. The container was removed after the run.

Observed payload:

```json
{"total_units":45044,"birth_zero_units":0,"birth_zero_fraction":0,"authorized_subsets":[{"viewer":"curve","positive_birth_units":1600,"birth_zero_units":0,"all_complete_units":1600},{"viewer":"foreign","positive_birth_units":7500,"birth_zero_units":0,"all_complete_units":7500},{"viewer":"supported","positive_birth_units":1500,"birth_zero_units":0,"all_complete_units":1500}]}
```

Markers:

```text
CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN
CARTOGRAPHER_K5A_BIRTH_ZERO_MEASUREMENT_GREEN
CARTOGRAPHER_K5A_C3_LOCAL_GREEN
```

## Boundary

This receipt changes no product floor and installs no migration. The coordinated
G8 payload belongs in migration 080, the only slot after 078/079 and before the
081 cutover. Until G9 rules 080's final scope, the payload is prepared and
proved outside `supabase/migrations/`; neither 080 nor 081 is authored here.
