# K5a C1/C2 lifecycle — local structural proof (2026-08-02)

Status: `current`

Sanitization: the proof used only synthetic claims and the existing disposable
K3/K4 fixture identities. No hosted identifier, credential, or personal corpus
value was used.

## Result

`recipes/cartographer-k5a-c1-c2-local-proof.sh` completed successfully against
the pinned pgvector PostgreSQL image in a disposable container with networking
disabled. Migration `078` was applied twice before the assertions. The recipe
emitted:

```text
CARTOGRAPHER_K5A_C1_C2_LOCAL_GREEN
```

No live Supabase project or other live database was read or written.

## Observed battery

| Boundary | Observed result |
| --- | --- |
| Restart safety | Migration `078` completed twice in one installed K4c-shaped database without duplicate types, relations, constraints, indexes, triggers, functions, or grants. |
| Per-person sessions | Owner and room member stored distinct index rows for the same room session; each row used the durable session creation time. |
| Legacy session upgrade | A pre-078 row carrying the retired writer's processing-time timestamp was normalized to durable `sessions.created_at` before effective distance could read it. |
| Citation identity | Three same-session standing deliveries produced one act; standing, reach, and search produced distinct channelled acts. |
| Eligibility | A room member could cite the shared unit and could not cite the owner-private unit; denial left no act. |
| Attention arithmetic | Non-latched legacy fixtures matched the type-aware decay curve and 0.05 promotion increment; promotion capped at 1.0. |
| Named divergence | A non-retired unit may recover above zero under pure recomputation; the same fixture with a `retired` act returns zero. |
| Promotion window | Standing acts and reach acts older than the newest six viewer sessions did not promote. |
| Privacy | Owner citations changed only the owner's effective attention; the member's attention and session distance remained independently computed. |
| Immutability | Update and delete attempts against lifecycle acts failed, and `knowledge_units` remained byte-identical across every read and act write. |
| Citation shape | A direct cited-act insert with a null actor profile failed the lifecycle shape constraint. |
| Database authority | The act relation and all writer/read functions were inaccessible to `authenticated`; service role retained the exact required grants. |

## TypeScript delivery boundary

The application boundary records every unit-backed standing preference before
it enters the composed prompt, and records every successful `graph_memory`
result through the `reach` channel before returning it to the model. A failed
citation write withholds those claims and preserves the existing honest
`exception`/memory-warning shape. Projected and graph-derived copies of the
same source event still render once, while the underlying unit receives one
standing act for the session.

The old Cartographer-local `upsertSessionIndex` implementation was removed.
Both the turn composer and Cartographer now call the typed, per-person
`upsert_person_session_index` RPC boundary introduced by migration `078`.

The focused lifecycle, standing-delivery, reach-delivery, Cartographer, and
schema contract tests passed, and the full Vitest run passed 475 tests in 91
files. TypeScript strict checking also passed.

## Command

```bash
./recipes/cartographer-k5a-c1-c2-local-proof.sh
npm run type-check
npx vitest run
```

This proves migration `078` and its database arithmetic. It does not apply the
migration to a hosted database, install migration `079`, cut over the runtime,
or prove later K5a stages.
