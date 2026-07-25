# Agent-selected retrieval

Voyager already exposes retrieval as registered tools. The primary model chooses
semantic, keyword, anchored, temporal, node, or graph retrieval according to the
question; there is no second fixed retrieval planner.

No registered tool traverses the graph. The K2 cutover deleted the event-only
`graph` tool with the `graph_traverse` RPC and `knowledge_edges` table it read.
The six-kind boundary in `lib/knowledge/kernel/boundary.ts` remains unregistered
until K3 produces claims worth traversing; when it is registered it returns only
claim, source event ID, and source content—never counts, paths, edge metadata,
evidence, grants, labels, or denial distinctions.

The graph is an authorized retrieval index over the sole `knowledge_events`
content ledger:

- `graph_nodes` stores scope-neutral canonical identities.
- `knowledge_audiences` stores immutable source and authority snapshots.
- `graph_node_grants` stores typed identity-discovery evidence.
- `graph_edges` and `graph_edge_evidence` store immutable historical relations.
- `graph_authority_edges` is a rebuildable current product-authority projection.

Root and per-hop checks are mandatory. Source events and KnowledgeUnits require
their exact immutable source audience. Structural endpoints require the exact
edge/evidence grant. Current membership hops recheck the authoritative product
row, revision, state, and time.

Source intent, audience, event, graph projection and fan-out are now atomic:
migrations 060–069 landed as one release boundary, and `lib/messaging/ingress.ts`
is the only path a message takes into the ledger. Never add a second ingress
writer, and never write part of that set outside the one claiming transaction.
