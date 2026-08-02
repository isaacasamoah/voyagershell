# K5a C3 R3 selecting read — local PoC proof (2026-08-02)

Status: `R3 battery passed`

Sanitization: the proof used only synthetic claims and the existing disposable
K3/K4 fixture identities. No hosted identifier, credential, personal corpus,
or live database was read or written.

## Result

`recipes/cartographer-k5a-c3-local-proof.sh` applied migrations 078 and 079
twice, then ran the R3 selecting-read battery in the pinned pgvector PostgreSQL
image with container networking disabled. It emitted:

```text
CARTOGRAPHER_K5A_C3_LOCAL_GREEN
```

Migration 079 now owns an append-only `knowledge_relation_annotation_index`.
The relation-assertion insert trigger writes two oriented endpoint rows in the
same transaction. Each row is keyed by endpoint and assertion person, retains
the exact input grants to reverify, and carries a derived repair priority:
newer-ward `supersedes`, then one-hop `contradicts`, then older-ward
`supersedes`. The table is immutable, RLS-enabled, readable only by the service
role, and not directly writable by any application role. Migration backfill
fails if an assertion does not produce exactly two rows.

## R3 battery

| Boundary | Observed result |
| --- | --- |
| Walk before selection | Authorization completed as a graph walk before effective-attention ranking or top-K selection. |
| Atomic top-K repair | A stale top-three claim brought in its below-budget correction without exposing edge kinds or internal counters. |
| Foreign-degree independence | The same already viewer-visible edge gained 128 foreign-person assertions, so traversal topology did not change. Before and after, the full reader's result and truncation flag were byte-identical; both full reads and fifty repeated index seeks stayed below the 550 ms floor and within 200 ms of each other. |
| Own-degree overflow | Eight viewer-owned partners with a cap of two returned the focus plus exactly two partners. Cause-specific proof instrumentation recorded `own_degree_truncated = true`, so the probe does not borrow its verdict from top-K truncation. |
| Bounded chain closure | A newer-ward A-B-C-D supersession chain closed while budget remained. With closure budget one, C still arrived with its B tension while D was omitted, and cause-specific instrumentation recorded closure-budget truncation. |
| Supersedes first | With only six annotation-budget units, C arrived through B before B's contradicting partner was considered. |
| Suppressed pair | A room-visible pair asserted by another person, with a private third input, did not promote or annotate either endpoint for the viewer. |
| Mechanism proof | Executed JSON plans used the same `knowledge_relation_annotation_own_lookup` shape before and after foreign fan-in, with endpoint and assertion person together in `Index Cond` and no `Filter`. The suppressed lookup read zero rows, foreign assertion rows were never scanned, and no plan referenced `knowledge_relation_assertions`. Sequential and bitmap scans were disabled at this authorization boundary so table size or statistics cannot replace the exact own-person seek. |
| Input revalidation | Every admitted annotation rechecked all assertion input grants before promotion or tension output. Closure steps consumed the annotation budget. |
| Attention and dedupe | Standing deliveries and an expired reach citation did not entrench old memory; excluded working memory was not reintroduced. |
| Concurrent suppression | Eight parallel reads returned the same no-annotation suppressed-pair shape. |

## Command

```bash
./recipes/cartographer-k5a-c3-local-proof.sh
```

This is an empirical C3 mechanism verdict for the R3 amendment. It does not
install the final migration-079 selecting RPC, touch a hosted database, measure
composer latency, prove composer wording, or authorize K5a stage two. Per the
G4 ruling, relation-job draining remains lazy and was not forced by this read.
