# Contributing to Voyager

Read [CLAUDE.md](./CLAUDE.md) and [ARCHITECTURE.md](./ARCHITECTURE.md) before
changing the application. `feature/*` branches flow to `dev` for preview;
`main` is production and is promoted only through the documented release
ritual.

## Local setup

Requirements: Node.js 20, npm, Supabase access for database work, and a local
`.env.local` derived from [.env.example](./.env.example).

```bash
npm ci
npm run dev
```

Run before review:

```bash
npm run type-check
npm run test:run
```

Use the focused test nearest your change while iterating. Database proof recipes
are documented in [recipes/README.md](./recipes/README.md).

## Code standards

- TypeScript is strict.
- Use named exports and arrow components.
- Keep source, SQL, recipe, and contributor-document files below 250 lines;
  split coherent modules instead of compressing unrelated responsibilities.
- Co-locate focused `*.test.ts` files with the contract they protect.
- Preserve user work in dirty worktrees and keep changes task-scoped.
- Update documentation in the same clean transition as code.

Use `lib/debug/logger.ts` for structured application logging. Select models
through `lib/models/router.ts`; do not hardcode model IDs.

## Clean transitions

When replacing a function, table, tool, vocabulary, or runtime path, inventory
every live caller and delete the old definition and references in the same
change. Do not add compatibility wrappers, duplicate registries, or deferred
cleanup. Historical migrations remain history; active tests, docs, and scripts
must describe the current contract.

## Knowledge and graph changes

`knowledge_events` is the sole event-content ledger. Do not add another content
table or make the graph authoritative for product membership.

The canonical graph contract is:

- one canonical scope-neutral `graph_nodes` row per kind and authority;
- immutable canonical source/authority audience snapshots;
- typed immutable node grants;
- immutable canonical historical edges with exact event evidence;
- rebuildable current authority edges projected from product rows; and
- root and per-hop authorization behind the registered `graph_memory` boundary.

MessageEvent and KnowledgeUnit visibility must exactly inherit the source
audience. Structural historical visibility requires the exact edge-evidence
basis. A link never creates endpoint grants. Current membership checks must use
`state = 'active'`; retained `left` rows grant nothing.

The K2 cutover removed the event-only `graph` tool. The current
`graph_memory` tool traverses the canonical graph from the speaking Person and
returns only authorized typed claims. K3 supplies source-derived units, K4b
adds canonical topic identity, and K4c adds evidence-gated conflict and
supersession relations. Extend `lib/knowledge/kernel/boundary.ts` without
exposing paths, counts, grants, evidence, labels, edge metadata, or provenance.

## Migration safety

- Never rewrite deployed migrations 001–053.
- Do not apply a migration permanently unless the task and release protocol
  explicitly authorize it.
- Hosted proof fixtures must be isolated from arbitrary rows, use deterministic
  negative `knowledge_events.sequence_num` values, never call `setval`, and run
  entirely inside `BEGIN`/`ROLLBACK`.
- Preserve token secrecy and use `curl --fail-with-body` plus an exact verdict.
- Prove the public catalogue is unchanged after rollback.

Product migration files currently end at the K4c relation ledger, 077. File numbering and
the hosted migration ledger are not installed-state authority: run the shared
pre-054 catalogue contract before applying 054–059. Migrations 060–071 are ONE
release boundary — source intent, graph substrate, cutover with backfill and
rejection evidence, authority projections, atomic ingress, deployment-gap
recovery, and exact source-audience inheritance for Voyager responses — and must
never be applied in part. K2 atomically creates the canonical source audience,
event, MessageEvent node, grants, historical edges/evidence, and fan-out.
Voyager replies use that same writer and inherit the claimed human source
audience; never recompute it from the current room. The bounded `NULL -> UUID`
transition exists only for deployment-gap recovery.

Migrations 072–077 add event-owned extraction, the registered graph-memory
reader, canonical topic identity, and the relation-conflict ledger. They do not
change the rule that `knowledge_events` is the only event-content authority.

## Pull requests

Keep commits atomic and explain the user-visible or architectural outcome, the
proof run, and any residual release gate. Never claim a hosted, preview, or
production result you did not observe. Review must be clean before preview;
production requires the separate human Test Gate and release instruction.
