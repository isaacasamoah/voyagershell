# K5a C3 selecting read — local PoC proof (2026-08-02)

Status: `current`

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

This proves the selecting mechanism before the full migration-079 read is
built. It does not install a production RPC, touch a hosted database, prove the
future composer wording, or close K5a stages two through four.
