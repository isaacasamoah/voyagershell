# K5a C3/C4 selecting and search read — local proof (2026-08-02)

Status: `C3 passed; original C4 result superseded by the R4 blocker receipt`

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

Migration 079 now owns the production
`retrieve_knowledge_graph_claims_v3`, unit-native vector and keyword search,
and an append-only `knowledge_relation_annotation_index`.
The relation-assertion insert trigger writes two oriented endpoint rows in the
same transaction. Each row is keyed by endpoint and assertion person, retains
the exact input grants to reverify, and carries a derived repair priority:
newer-ward `supersedes`, then one-hop `contradicts`, then older-ward
`supersedes`. The table is immutable, RLS-enabled, readable only by the service
role, and not directly writable by any application role. Migration backfill
fails if an assertion does not produce exactly two rows.

## Production read battery

| Boundary | Observed result |
| --- | --- |
| Walk before selection | Authorization completed as a graph walk before effective-attention ranking or top-K selection. |
| Atomic top-K repair | A stale top-three claim brought in its below-budget correction without exposing edge kinds or internal counters. |
| Foreign-degree independence | The same already viewer-visible edge gained 128 foreign-person assertions, so traversal topology did not change. Before and after, the full reader's result and truncation flag were byte-identical; both full reads and fifty repeated index seeks stayed below the 550 ms floor and within 200 ms of each other. |
| Own-degree overflow | Eight viewer-owned partners with a cap of two returned the focus plus exactly two partners and an honest `truncated = true`. |
| Bounded chain closure | A newer-ward A-B-C-D supersession chain closed while budget remained. With closure budget one, C still arrived with its B tension while D was omitted and `truncated = true`. |
| Supersedes first | With only six annotation-budget units, C arrived through B before B's contradicting partner was considered. |
| Suppressed pair | A room-visible pair asserted by another person, with a private third input, did not promote or annotate either endpoint for the viewer. |
| Mechanism proof | Executed JSON plans used the same `knowledge_relation_annotation_own_lookup` shape before and after foreign fan-in, with endpoint and assertion person together in `Index Cond` and no `Filter`. The suppressed lookup read zero rows, foreign assertion rows were never scanned, and no plan referenced `knowledge_relation_assertions`. Sequential and bitmap scans were disabled at this authorization boundary so table size or statistics cannot replace the exact own-person seek. |
| Input revalidation | Every admitted annotation rechecked all assertion input grants before promotion or tension output. Closure steps consumed the annotation budget. |
| Attention and dedupe | Standing deliveries and an expired reach citation did not entrench old memory; excluded working memory was not reintroduced. |
| Concurrent suppression | Eight parallel reads returned the same no-annotation suppressed-pair shape. |
| Production equivalence | Every selecting-read and concurrent probe invokes `retrieve_knowledge_graph_claims_v3`; the disposable PoC function remains only as the original mechanism reference. |
| Victim-seat search | Keyword, vector, and exact-unit-ID reads returned byte-identical `[]` for a person outside the private audience; the owner received exactly the private unit with its exact source event ID. |
| Search authority | Both unit search functions use graph grant plus audience predicates. Anchored search walks from the Person node. Neither function calls the retired caller-scope authorization model. |
| Semantic read | The original bounded-HNSW observation was falsified by the later exact-recall stress probe and is not release evidence. R4 now requires exact distance over the authorized subset; its current re-PoC and remaining plan-stability blocker are recorded in `k5a-c4-vector-authorization-blocked-2026-08-02.md`. |

The amended C1/C2 battery also seeds 8,000 viewer sessions. Its executed plan
returns the six-session citation window through
`idx_session_index_user_started` with five shared blocks, while all attention
parity fixtures remain green.

## Command

```bash
./recipes/cartographer-k5a-c3-local-proof.sh
```

This is a local production-function verdict for K5a stage two. It does not
touch a hosted database, measure hosted composer latency, exercise C5, install
`080`, execute the `081` cutover, or authorize release. Per the G4 ruling,
annotation is lazy at the viewer's next read, performs no provider call, and
never enumerates foreign assertions.
