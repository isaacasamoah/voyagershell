# K5a C3 selecting read — local PoC proof (2026-08-02)

Status: `blocked at independent review`

Sanitization: the proof used only synthetic claims and the existing disposable
K3/K4 fixture identities. No hosted identifier, credential, or personal corpus
value was used.

## Result

`recipes/cartographer-k5a-c3-local-proof.sh` completed successfully against the
pinned pgvector PostgreSQL image in a disposable container with networking
disabled. It emitted:

```text
CARTOGRAPHER_K5A_C3_LOCAL_GREEN
```

No live Supabase project or other live database was read or written.

This green marker is an empirical battery result, not an accepted C3 verdict.
Independent Build review found that the PoC derives public truncation from raw
tension degree and assertion-input pressure before the assertion is authorized.
Moving authorization in front of those counters avoids the output leak but
requires scanning arbitrary hidden degree before the stated budgets, which
breaks the structural deadline bound. The approved privacy, honest-completeness,
and bounded-check claims therefore need a Spec decision: an indexed current
authorization projection, a hard degree invariant, or an explicit amendment.

The same review found that pair repair processes only the original top-K
snapshot. A promoted middle node in an A-B-C tension chain can survive without
bringing C. A bounded repair queue and a three-node chain probe are required
after the authorization design is settled.

## Observed battery

| Boundary | Observed result |
| --- | --- |
| Ordered read | Authorization completed as a graph walk before effective-attention ranking or claim selection began. |
| Atomic selection | A stale 0.95 claim survived top three while its 0.20 correction fell below the budget line; the returned set was the exact top three plus the correction. |
| Suppressed assertion | A room-visible pair whose assertion included a private third input did not promote its lower endpoint and returned no tension, count, edge kind, or timing field. |
| Annotation budgets | A focus claim with eight tension partners stopped at the two-partner and four-input-check limits, completed beneath the existing 550 ms application floor, and reported only `truncated = true`. |
| Truncation honesty | Every over-budget result returned `truncated = true`; no failed or partial read was presented as complete. |
| Attention dynamics | Twelve standing deliveries and one reach delivery outside the decay window contributed no promotion, so a fresh birth-0.9 claim outranked the old birth-0.6 claim. |
| Working-memory dedupe | The excluded standing preference was not reintroduced by selection or pair repair. |
| Concurrent suppression | Eight parallel suppressed-pair reads returned the same no-annotation shape. |

## Command

```bash
./recipes/cartographer-k5a-c3-local-proof.sh
```

This records the seeded behavior that passed before the full migration-079 read
is built. It does not prove the approved selecting mechanism, install a
production RPC, touch a hosted database, prove the future composer wording, or
authorize K5a stage two.
