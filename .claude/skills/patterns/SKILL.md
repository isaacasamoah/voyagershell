---
name: patterns
description: Voyager codebase patterns for agents, tools, knowledge, privacy, logging, and models.
---

# Voyager patterns

Read this before implementing a feature. Full shared patterns live at
`~/.claude/modules/patterns/voyager/PATTERNS.md`; repository truth wins when the
two differ.

## Quick reference

| Pattern | Location |
|---|---|
| Agent primitives and registry | `lib/agents/primitives.ts` |
| Final tool registry | `lib/retrieval/voyager-tools.ts` |
| Knowledge retrieval tools | `lib/retrieval/knowledge-retrieval-tools.ts` |
| Future graph proof boundary | `lib/knowledge/kernel/boundary.ts` |
| Knowledge event writer | `lib/knowledge/events.ts` |
| Prompt composition | `lib/prompts/` |
| Tool types | `lib/retrieval/tool-types.ts` |
| Debug logging | `lib/debug/logger.ts` |
| Model selection | `lib/models/router.ts` |
| Background queue | `lib/agents/queue.ts` |

## Agents and retrieval

The primary Voyager owns the conversation and decides whether and how to
retrieve. Background work returns findings to the same primary voice. Avoid
heuristics that compete with the model for query-depth decisions.

`createVoyagerTools()` is the single registered catalogue. Knowledge tools are
`semantic_search`, `keyword_grep`, `anchored_search` and `get_nodes`. The K2
cutover removed the legacy `graph` tool with the `graph_traverse` RPC and
`knowledge_edges` table it read, so nothing traverses the graph today. The
six-kind kernel boundary is still an isolated proof client; when K3 gives it a
live caller, never expose paths, counts, grants, evidence, labels, edge
metadata, or provenance through it.

## Knowledge contract

```text
knowledge_events       sole append-only event-content ledger
knowledge_current      derived search and embedding projection
knowledge_units        immutable claims with exact source provenance
graph_nodes            scope-neutral canonical identities
knowledge_audiences    immutable source/authority snapshots
graph_node_grants      typed identity-discovery evidence
graph_edges            immutable historical/source/semantic relations
graph_edge_evidence    exact evidence events for historical edges
graph_authority_edges  rebuildable current product-authority projection
```

One Person, Voyager, Voyage, or Space has one node across every scope. Never
duplicate an identity to represent visibility and never put an audience on the
node. Source content is authorized only by its immutable source audience; a
KnowledgeUnit inherits that audience exactly.

Grant bases are typed. `source_event` may bind only a MessageEvent to itself or
a KnowledgeUnit to its exact source. Structural endpoints require
`edge_evidence` for the exact edge, event, audience, and endpoint. Product bases
carry exact IDs, versions, and effective times. A link does not create grants.

Current `member_of`, `in_voyage`, and `companion_of` relations come only from
product triggers. Traversal rechecks the live product row, state, revision, and
time. Only `state = 'active'` is membership; `left` rows are retained historical
authority and grant no current product access.

Profile and voyage triggers are the sole writers of current Person/Voyager and
Voyage labels. Membership and space projectors may ensure canonical nodes but
must not overwrite those labels. Historical-only discovery uses the immutable
grant label snapshot.

## K2 release boundary

Migrations 060–071 are ONE release boundary and were applied as one transaction:
the source-intent claim, the graph substrate, the cutover with its backfill and
rejection evidence, the authority projections, the atomic ingress and the
deployment-gap recovery, and private Voyager response audience inheritance.
There is no partial cutover and no dual runtime.
Deployable 054–059 hardens membership, retrieval, invites, promotion, and
session authority cleanup but does not install graph tables.
The harness uses `lib/messaging/ingress.ts` for both human source messages and
Voyager responses. It writes source audience, event, MessageEvent node, grants,
structural edges/evidence, and fan-out in one transaction; recovers deployment-
gap events; and enforces a non-null event audience. A response inherits its
human source audience and uses `generated_by`; never recompute it from room
presence. The bounded canonical `NULL -> UUID` transition exists only inside
deployment-gap recovery and all later changes are rejected.

## Logging and models

Use `log.message`, `log.voyage`, `log.memory`, `log.agent`, `log.api`, and the
other domains exported by `lib/debug/logger.ts`. Enable with `VOYAGER_DEBUG=*`
or a comma-separated domain list.

Select models through `modelRouter`; never hardcode provider model IDs. Use the
chat task for user-facing primary and follow-up responses so Voyager keeps one
voice.

## Code rules

- TypeScript strict, named exports, arrow components.
- Files below 250 lines; split by coherent responsibility.
- One canonical owner for each fact or runtime path.
- Database privacy at the database boundary plus the application boundary.
- Clean transitions delete the replaced definition and every live caller in the
  same change; no compatibility wrappers.
- Hosted proof data is rollback-only, sequence-neutral, isolated, and secret
  safe.
