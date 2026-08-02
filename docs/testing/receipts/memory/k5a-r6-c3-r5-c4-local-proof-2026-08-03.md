# K5a R6 C3 and R5 C4 local proof (2026-08-03)

Status: `C3_AND_C4_LOCAL_BATTERIES_GREEN`

Base checkpoint: `213bb5fc4e76905c82af2d665a4914e3d5a671f4` on
`feature/k5a-graph-memory`.

This receipt records the final local Stage 2 candidate proof. It does not apply
migrations to a hosted database, execute migrations 080 or 081, authorize a
release, or settle G5.

Sanitization: the proof used only synthetic fixture data in the pinned
no-network pgvector container. It read no hosted identifier, credential,
personal corpus, or live database.

## Command and marker

```bash
./recipes/cartographer-k5a-c3-local-proof.sh
```

```text
CARTOGRAPHER_K5A_C3_LOCAL_GREEN
```

The driver applied migrations 078 and 079 twice, ran the complete C3 behavior
set and eight concurrent production-v3 probes at both scales, then ran the R5
C4 exact-search battery. No planner GUC or ANN setting was used. Production
`retrieve_knowledge_graph_claims_v3` remained structurally unchanged from the
R5 blocker checkpoint.

## C3: the ruled two regimes

The proof driver reads `RESPONSE_FLOOR_MS` from
`lib/knowledge/kernel/boundary.ts`, validates the declaration, and passes that
value to the SQL battery. The SQL contains no copied floor literal. The named
small-relation budget is eight PostgreSQL pages.

| Observation                     | Before foreign growth |     Small scale |                           Realistic before |                            Realistic after |
| ------------------------------- | --------------------: | --------------: | -----------------------------------------: | -----------------------------------------: |
| Foreign assertions on the focus |                     0 |             128 |                                      1,001 |                                      2,002 |
| Annotation relation pages       |                     1 |               7 |                                         46 |                                         90 |
| Access path                     |       sequential scan | sequential scan | `knowledge_relation_annotation_own_lookup` | `knowledge_relation_annotation_own_lookup` |
| Rows actually read              |                    34 |             290 |                                          1 |                                          1 |
| Rows removed by filter          |                    33 |             289 |                                          0 |                                          0 |

At small scale the complete-reader p95 was 169.049 ms before and 171.890 ms
after the 128 foreign assertions. Both are below the 550 ms value read from the
application boundary, so the emitted response remains on the same floor.

The first measured state beyond the eight-page budget was nine pages, at 168
foreign assertions. Its plan used the named own-person lookup, read one row,
and removed zero rows by filter. This directly asserts the crossover rather
than assuming it.

At realistic scale the full C3 results and truncation state were byte-identical
across 1,001 → 2,002 foreign assertions. Five unchanged-corpus p95 samples were
171.923, 168.013, 168.115, 163.376, and 174.118 ms; their mean was 169.109 ms
and their measured three-sigma envelope was 12.375 ms. The post-growth p95 was
164.377 ms, inside that envelope. At both realistic points the plan read one
row through the own lookup and removed zero, so rows read did not change by
one.

The full unconstrained call-path set ran before and after small growth and
before and after realistic growth: atomic top-K pair repair, exclusion dedupe,
suppressed-pair non-disclosure, own-degree overflow, supersedes-first closure,
bounded middle-chain degradation, plan-level non-enumeration, output identity,
and latency. Eight concurrent calls to production v3 also passed at each scale.

## C4: exact authorization is the bound

The first R5 execution exposed one audience-member unit without a graph grant:
membership enumeration admitted 1,002 IDs and the later graph filter reduced
them to the true 1,001. The semantic query was corrected to apply the existing
graph-grant predicate while enumerating the membership-indexed ID set, before
primary-key hydration. The repeated battery then observed:

- exact-match recall at 100 units, 1,001 units, and the instrumented curve
  probe;
- `knowledge_audiences_member_profile_ids_lookup` for audience membership,
  `knowledge_units_audience_lookup` for unit membership,
  `knowledge_units_pkey` for hydration, `knowledge_events_pkey` for sources,
  and `knowledge_unit_retirements_lookup` for retirement checks;
- exactly 1,001 primary-key unit rows hydrated, with zero removed by filter;
- byte-identical owner results and unchanged rows read after tenfold foreign
  authorized-corpus growth to 13,680 units;
- owner baseline p95 values of 424.188, 403.986, 385.930, 387.208, and
  389.036 ms, mean 398.070 ms, measured three-sigma envelope 48.931 ms, and
  post-growth p95 386.339 ms inside that envelope.

The instrumented cost curve was 39.976 ms at 100 authorized units, 402.516 ms
at 1,001, and 552.121 ms at the 1,368-unit curve probe. The battery records
`g5_ann_threshold_units = null`: these cold-container measurements are not the
G5 threshold. Migration 076's HNSW index remains present only for the already
bounded K4b topic lookup; semantic search does not use it. No `ef_search`,
iterative scan, or planner forcing was introduced.

## Corrections made while proving

Two early C3 failures were evidence-parser defects, not mechanism failures:
the helper first over-required a sequential scan for every small endpoint, then
failed to collect a bitmap index name from its child plan node. The actual
crossover plan at that second stop already read one row with zero filtering.
The parser now accepts either legal small-scale path and traverses every JSON
plan node for index identity. A later suppressed endpoint used the table's
primary key with both endpoint and viewer in `Index Cond`; the helper now
asserts the ruled exact keyed index path and zero filtering while the focus and
crossover probes continue to require the named own lookup.

## Final local verification

The exact candidate completed the cumulative proof ring and application checks:

```text
CARTOGRAPHER_K3_LOCAL_GREEN
CARTOGRAPHER_K4A_LOCAL_GREEN
CARTOGRAPHER_K4B_LOCAL_GREEN
CARTOGRAPHER_K4C_LOCAL_GREEN
CARTOGRAPHER_K5A_C3_LOCAL_GREEN
CARTOGRAPHER_K5A_C1_C2_LOCAL_GREEN
Test Files  94 passed (94)
Tests       488 passed (488)
FULL_SUITE_GREEN
```

`npm run type-check` passed when run serially after the production build. The
first parallel attempt raced Next.js while it regenerated `.next/types`; it
reported transient missing generated files and was not treated as source
evidence. `npm run build` completed successfully. Its only diagnostics were the
existing image-optimization and hook-dependency warnings plus the expected
dynamic-route notice for the cookie-reading Codex connection endpoint.

## Independent re-review

The final independent implementation review returned clean after checking R6
C3, R5 C4, and the earlier rework items: identity-safe standing withholding,
`get_nodes` source hydration, the C1 cutoff and `started_at` lookup, delivery
closure for standing and tensions, and exact authorized semantic search. It
also confirmed production v3 is GUC-free and structurally unchanged from the
base checkpoint. Its only initial finding was contradictory active-blocker
language in the two historical receipts; both now carry explicit `SUPERSEDED`
statuses and scope their old stop instructions to their historical revisions.
The reviewer re-checked that correction and returned `VERIFIED-CLEAN`.

A separate read-only shell review returned `VERIFIED-CLEAN`: macOS Bash 3.2
syntax, source-coupled floor extraction, psql variable handling, concurrent PID
tracking, exit-status-preserving cleanup, no-network Docker isolation, and
bounded temporary-file deletion all held. ShellCheck reported only
source-resolution informational messages and the pre-existing cross-file
library false positive.
