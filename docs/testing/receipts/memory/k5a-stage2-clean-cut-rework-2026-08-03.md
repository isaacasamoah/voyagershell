# K5a Stage 2 clean-cut boundary rework (2026-08-03)

Status: `CLEAN_CUT_LOCAL_GREEN`

Base revision: `32a7dce36c27c6ad7a12a3d7aa426a99f8f3fb9c` on
`feature/k5a-graph-memory`.

This rework removes the retired caller-scope search implementation that the
unit-native Stage 2 cutover replaced. It does not change the C3 or C4 battery
bars, rename the held C4 battery, run migrations 080 or 081, or touch a hosted
database.

## Deletion receipt

The clean cut deleted six whole files totalling 713 lines:

- 623 lines of retired implementation in `scoped-search.ts`, `hybrid.ts`,
  `hybrid-primitives.ts`, `rerank.ts`, and `reformulate.ts`;
- the 90-line `anchor.test.ts`, whose only subject was the deleted
  `personAnchoredSearch` path.

It also removed:

- `getKnowledgeByIds` and its admin-client dependency from `search.ts` while
  retaining the independently live `searchKnowledge` export for
  `lib/conversation/continuity.ts`;
- the retired barrel exports, grep-only types, formatters, mocks, scope tests,
  active-membership/installed-boundary guard residue, and the now-unused Cohere
  environment entry. The Gemini entry remains only for its live developer
  scripts and no longer claims to configure query reformulation; its obsolete
  Next.js CI build placeholder is gone;
- the unused 375-line `k5a_c3_selecting_read_poc` function and its nine-line
  REVOKE/GRANT block. Production v3 and every SQL C3/C4 battery assertion
  remain unchanged.

Repository-wide residue searches found no surviving application or test
reference to the deleted modules or symbols. Three mentions of `keywordGrep`
remain only inside immutable historical migration text in migrations 016, 045,
and 046; they describe the code shape at those migrations and are not callable
application surfaces.

## Preserved and deferred boundaries

`searchKnowledge` stays because `lib/conversation/continuity.ts` still calls it;
that caller is outside this Stage 2 boundary rework.

This branch switched the application to v3 (ae8d666). The RELEASED application
(origin/dev boundary.ts:119) still calls v2 against the live database, so v2
must survive the deployment window: it is dropped only at 081 cutover, after
the released application no longer references it. On this branch, v2 and the
CandidateFunctions v2 Args entry persist solely as that deployment-window
surface, mandated for 081 deletion.

At this Stage 2 revision the C4 battery's filename was still held at its prior
round name pending adjudication. R7 later renamed the live battery to
`cartographer-k5a-c4-r5-assertions.sql`; this historical receipt remains scoped
to the revision named above.

## Verification

Focused tests for the changed contracts and surviving retrieval paths passed,
followed by the exact cumulative suite:

```text
CARTOGRAPHER_K3_LOCAL_GREEN
CARTOGRAPHER_K4A_LOCAL_GREEN
CARTOGRAPHER_K4B_LOCAL_GREEN
CARTOGRAPHER_K4C_LOCAL_GREEN
CARTOGRAPHER_K5A_C3_LOCAL_GREEN
CARTOGRAPHER_K5A_C1_C2_LOCAL_GREEN
Test Files  93 passed (93)
Tests       483 passed (483)
FULL_SUITE_GREEN
```

`npm run build`, serial `npm run type-check`, and `git diff --check` passed.
The build emitted only the existing image-optimization, hook-dependency,
outdated Browserslist, and expected cookie-reading dynamic-route notices.

The first unchanged cumulative run fired the C4 timing envelope by 0.65 ms:
all results, named access paths, 1,001 rows read, and zero rows removed were
identical, but the post-growth p95 was just below the measured lower bound. No
battery code or bar was changed. Both subsequent unchanged SQL executions were
green, including the final full-suite run; the initial timing observation was
reported to Bridge Prime for the ongoing battery adjudication.

## Independent clean-cut review

The independent clean-cut review found two documentation residues: current
docs still named the deleted exact-ID RPC, then initially conflated this
branch's v3 caller with the released application's v2 caller. The first was
replaced with the unit-native exact-ID path. Bridge Prime ruled the second with
the branch-versus-release deployment-window wording recorded above. After both
corrections, the review returned an empty findings matrix.
