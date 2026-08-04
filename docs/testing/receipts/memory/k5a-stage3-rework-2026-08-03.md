# K5A stage-3 consolidated rework

- **A PASS:** 081 now drops `on_knowledge_event_insert`, the exact 055
  `search_knowledge(vector, uuid, text, text[], double precision, integer,
  text, double precision)` signature, and the exact 055
  `scoped_knowledge_fetch(uuid, text, text, text, boolean, timestamptz,
  timestamptz, double precision, integer, uuid)` signature. These were
  grep-verified against migrations 010 and 055.
- **B PASS:** curator now reads `retrieveKnowledgeGraphClaims` and maps the
  authorized unit-native claims into its tiered token window. The dropped
  `scoped_knowledge_fetch` RPC is no longer on the prompt path.
- **C PASS:** dropped RPC/table declarations were removed from generated
  schema/types; stale mocks of deleted modules and removed embedding/event
  helpers were removed. Scope tests now mock the replacement boundary and no
  longer assert retired routing.
- **E2 PASS:** 081 uses `DROP TABLE IF EXISTS ... CASCADE`; the disposable
  proof driver applies 081 twice and emits `CARTOGRAPHER_K5A_081_IDEMPOTENT_GREEN`.
- **0 recorded:** ACL-leak finding withdrawn by review; no remediation.
- **D held:** G10 retired-result wiring remains untouched pending Isaac.
- **E1 held:** search-path floor/horizon scope remains with K5 Spec.

Verification: `npm run type-check`; full suite 95 files / 499 tests green;
`git diff --check` clean. No live database was accessed.
