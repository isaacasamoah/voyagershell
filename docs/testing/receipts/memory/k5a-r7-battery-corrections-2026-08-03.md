# K5a R7 battery corrections (2026-08-03)

Status: `R7_BATTERY_CORRECTIONS_LOCAL_GREEN`

Base revision: `b8d918b3b0564611f986cbce0aa18dedcc17097a` on
`feature/k5a-graph-memory`.

This receipt records the round-7 break-1 correction and G6 option-3
reclassification. It does not change `RESPONSE_FLOOR_MS`, claim that the
observable-boundary timing arm is complete, apply a hosted migration, touch a
live database, or execute migrations 080 or 081.

Sanitization: all SQL ran against synthetic fixture data in the pinned,
no-network disposable pgvector container. No hosted identifier, credential,
personal corpus, or live database was read.

## Correction made

The R6 battery fixed the small-relation page budget at eight pages and sampled
only one own annotation with two-to-three UUID assertion inputs on all-visible
pages. R7 replaces that single point with four pointwise fixtures. The driver
reads the maximum per-claim partner cap from `boundary.ts` and the relation
candidate limit from the active K4c contract; the production writer expression
at migration 077 line 625 makes the widest assertion input one focus plus 16
candidates, or 17 UUIDs.

Each fixture starts from an empty disposable relation with the production row
shape, primary key, and covering own-lookup index. Rows are fresh inserts, so
the crossover plan must show a heap fetch/block or a heap-reading index path.
The battery grows foreign rows in fixed batches, records every plan, derives
the last page count where a sequential plan was selected for that exact shape,
asserts the small-or-index disjunction at every sampled point, and then grows
again to prove the index branch remains intact.

| Shape            | Own degree | Input UUIDs | Row bytes | Derived page budget | First exact-index pages | Foreign rows at first index | Crossover path                           | Own rows read / removed |
| ---------------- | ---------: | ----------: | --------: | ------------------: | ----------------------: | --------------------------: | ---------------------------------------- | ----------------------: |
| own-degree-cap   |         16 |           2 |       176 |                   8 |                       8 |                         312 | covering own lookup, bitmap heap         |                  16 / 0 |
| production-width |          1 |          17 |       416 |                   6 |                       7 |                         120 | covering own lookup, index-only          |                   1 / 0 |
| non-all-visible  |          1 |           2 |       176 |                   5 |                       5 |                         216 | covering own lookup, index-only          |                   1 / 0 |
| combined-worst   |         16 |          17 |       416 |                  19 |                      19 |                         344 | endpoint+viewer primary key, bitmap heap |                  16 / 0 |

Every crossover had positive non-all-visible evidence. The combined shape is
important: wider included values made PostgreSQL prefer the table primary key,
whose leading columns are the same exact endpoint+viewer key. That path is
named and accepted only with exact own-cardinality reads and zero filtering;
sequential, full, or filter-after-read access above the derived budget fails.

The first executable correction moved source-derived psql values into a
one-row config table because psql does not interpolate inside a dollar-quoted
PL/pgSQL body. The first planner observation then showed that a crossover can
happen at a later row count on the same heap page, so the probe records both
page and row location instead of requiring a new page. The combined fixture
then selected the exact keyed primary path already accepted by the Stage 2
suppressed-endpoint proof; the probe now names both legal exact-own indexes.
None of these corrections changed the ruled disjunction or the production
query.

Independent shell and clean-cut review found four harness defects before the
checkpoint. Stage-one no longer duplicates ownership of the current R7
contract. The proof driver now parses the active TypeScript syntax tree for the
`perClaimPartnerCap` maximum instead of matching raw source text, so commented
or stale text cannot under-size the fixture and a future cap changes the tested
shape. The provisional C4 instrumented curve probe is capped at the measured
10,010-unit supported scale, preventing a near-zero sampled slope from creating
unbounded setup work; this diagnostic still does not derive G5. Finally, long
direct Docker proof commands are interruptible, and container creation invokes
the Docker client directly rather than through a shell-function subshell. The
signal handler terminates that client before exit cleanup removes the named
disposable container, closing the create-before-cleanup race.

## G6 reclassification

Rows read and rows removed are retained as design-integrity checks: they prove
that authorization is the logical bound above each derived budget. They are no
longer described or asserted as privacy independence. At the actual privacy
surface, the small and realistic production-v3 probes still assert identical
results, counts, truncation, and errors across foreign growth.

The existing in-database p95 comparisons are now diagnostics rather than
passing privacy criteria. In the final R7 run, realistic C3 grew 1,001 to 2,002
foreign assertions while retaining byte-identical results, one exact own row
read, and zero filtered rows. The unchanged-corpus database p95 samples were
169.486, 180.584, 177.057, 177.885, and 172.614 ms; post-growth was 176.527 ms,
inside the diagnostic three-sigma envelope of 13.286 ms.

The observable-boundary timing arm is deliberately absent at this checkpoint.
It lands only after the clean supported-scale measurement derives boundary
overhead, Isaac confirms the proposed product-visible floor, and the battery
can assert in-database work against floor minus measured overhead from source.
The C3/C4 notices and contract tests carry
`pending_confirmed_floor_minus_overhead` so this cannot be mistaken for a
complete timing proof.

## Rename and verification

The held battery rename is complete:
`cartographer-k5a-c4-r5-assertions.sql` replaces the prior round-name file, and
its fixture identifiers, tests, proof driver, and diagnostics all use R5
vocabulary. No duplicate battery or compatibility path remains.

Focused contract proof:

```text
Test Files  2 passed (2)
Tests       11 passed (11)
```

Disposable database marker:

```text
CARTOGRAPHER_K5A_C3_LOCAL_GREEN
```
