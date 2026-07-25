# Voyager

Voyager is a conversational collaboration co-pilot. It combines streaming chat,
shared voyages and rooms, event-sourced memory, and agent-selected retrieval.

## Current architecture

```text
Next.js chat and room APIs
        |
        +-- Voyager tool registry
        |     semantic_search, keyword_grep, anchored_search, get_nodes, ...
        |
        +-- atomic ingress (claim, audience, event, graph, outbox in one commit)
        |
        +-- knowledge_events: sole event-content ledger
        |     knowledge_current: derived search projection
        |
        +-- the canonical graph (migrations 061-069)
              scope-neutral identities, immutable audiences and grants
              evidence-bound historical edges and current authority projections
```

There is one graph. The K2 cutover replaced the event-only legacy graph with the
canonical substrate and removed the old table, its traversal RPC and every
caller in the same change; no tool traverses the graph until K3 gives it claims
worth traversing. Every message enters through one database function that claims
the intent before it writes anything, so a retry cannot produce a second event,
a second graph fragment or a second delivery.
Service-role tool code never hydrates `knowledge_current` directly:
`get_knowledge_by_ids` and `get_voyage_messages` require the caller identity and
recheck current membership inside PostgreSQL at execution time.

Voyage membership has one current meaning: only a retained row with
`state = 'active'` grants product access. A rejoin reactivates that row as crew
and increments its authority revision.

## Knowledge and privacy invariants

- `knowledge_events` remains the only event-content ledger.
- A KnowledgeUnit inherits its source event audience exactly.
- Graph node IDs, edge IDs, audience IDs, and space-member IDs are canonical and
  enforced at the database boundary.
- A source audience is immutable. Membership changes create authority snapshots;
  they never rewrite source visibility.
- Structural historical discovery requires an exact edge/evidence grant.
- Current `member_of`, `in_voyage`, and `companion_of` edges mirror product rows
  and are rechecked against exact state, revision, and effective time.
- Historical-only access returns the label captured by the grant. Current
  authorized access may return the current registry label.
- Creating a link does not create endpoint grants.

## Installed-state boundary and K2 release gate

Migration source files `001`–`053` are byte-sealed to the reviewed K0 revision,
but their numbers and the hosted migration ledger are not treated as a
replayable installed-state oracle. The explicit read-only pre-054 contract
names the public tables, columns, types, enum values, function identities,
security modes, grants, triggers, and constraints required by the next six
hardening migrations. `054` makes active voyage/space membership authoritative,
`055` hardens installed retrieval, `056` creates room invites atomically, `057`
retires ambiguous pending memberships and installs exact-room invite responses,
`058` promotes private replies, and `059` removes obsolete session mutation
paths. Existing invite events remain immutable history; their senders must issue
a fresh exact-room knock before the recipient can act.
The migration-shaped graph candidate `057`–`063` lives only under
`recipes/sql/knowledge-graph/` and must not be released independently.
`lib/supabase/types.ts` remains the application database contract. The local
installed-authority proof constructs a deterministic pre-054 subset, runs the
precondition, applies only 054–059, and derives the scoped post-migration
catalogue/type/ACL contract from real `pg_catalog`; it does not claim to
reproduce unrelated hosted objects. The future graph shape remains separate in
`lib/knowledge/kernel/candidate-schema.ts`.

K2 must first make ordinary message ingress atomic: create the canonical source
audience, event, message node, endpoint grants, historical edges, evidence, and
fan-out in one transaction. It must then backfill any events written during a
deployment gap and enforce `knowledge_events.knowledge_audience_id NOT NULL`.
Until that cut exists, the once-only `NULL -> canonical audience` assignment is
deliberately retained so a gap event is recoverable; any second audience change
is rejected.

## Setup

Requirements: Node.js 20, npm, a Supabase project, and the keys described in
[.env.example](./.env.example).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Do not apply migrations to production as part of ordinary development. Preview
and production promotion follow [CLAUDE.md](./CLAUDE.md).

## Verification

```bash
npm run type-check
npm run test:run
for recipe in recipes/*.sh; do bash -n "$recipe"; done
```

`recipes/knowledge-graph-poc.sh` is a hosted PostgreSQL proof, not an installer.
It resolves credentials without printing them, executes the candidate and its
fixtures inside one `BEGIN`/`ROLLBACK`, and verifies the public catalogue is
identical afterward. See [recipes/README.md](./recipes/README.md).

## Project map

```text
app/api/chat/route.ts                     streaming chat boundary
lib/knowledge/events.ts                   current event writer
lib/knowledge/kernel/                     graph contract, fixture, SQL proofs
lib/retrieval/knowledge-retrieval-tools.ts registered graph tool
lib/retrieval/voyager-tools.ts            final tool registry
lib/voyage/                               voyage membership and sessions
supabase/migrations/                      immutable 001-053 plus hardening 054-059
recipes/sql/knowledge-graph/              uninstalled graph candidate 057-063
recipes/                                  rollback-only proving recipes
```

Contributor architecture and workflow are in [ARCHITECTURE.md](./ARCHITECTURE.md)
and [CONTRIBUTING.md](./CONTRIBUTING.md).
