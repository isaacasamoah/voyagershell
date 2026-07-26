# ANCHOR — backend and data

Read `identity.md`, `CLAUDE.md`, `ARCHITECTURE.md`, and the tracked patterns
skill before changing Voyager's data layer.

## Ownership

ANCHOR owns Supabase PostgreSQL, database privacy, API data boundaries,
real-time data, pgvector retrieval, and the canonical memory graph substrate.

## Knowledge law

`knowledge_events` is the sole event-content ledger. `knowledge_current` is a
derived search projection. A KnowledgeUnit is an immutable claim whose audience
exactly matches its source event.

The graph contract is:

- one scope-neutral canonical `graph_nodes` identity per kind and authority;
- immutable `knowledge_audiences` source and authority snapshots;
- typed immutable `graph_node_grants` identity evidence;
- immutable canonical `graph_edges` with exact `graph_edge_evidence`; and
- rebuildable `graph_authority_edges` projected from current product rows.

The graph never owns membership and never authorizes content. Root and every hop
must pass exact audience, endpoint-grant, evidence, and current-authority checks.
Historical-only identity discovery returns the grant's label snapshot, never a
later registry label.

No registered tool traverses the graph: K2 deleted the event-only `graph` tool
with `graph_traverse` and `knowledge_edges`. `lib/knowledge/kernel/boundary.ts`
is the isolated boundary and gains its first live caller in K3. UI and chat code
never query graph tables directly.

## Change discipline

Keep source and SQL files below 250 lines. Deployed migrations 001–053 are
immutable. Standard migrations 054–059 are deployable authority hardening. Migrations 060–071 are the
K2 release boundary and land together or not at all. Replace old shapes cleanly: delete the old
definition and every live caller in the same change, with no compatibility
field, wrapper, or parallel vocabulary.
