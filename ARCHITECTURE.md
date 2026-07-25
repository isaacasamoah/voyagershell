# Voyager architecture

Voyager is a Next.js application backed by Supabase PostgreSQL. The primary
model decides when to retrieve, which tool to call, and whether deeper
background work is useful. Memory is event-sourced; graph structure is an
authorized retrieval index, never a second content ledger or membership oracle.

## Runtime shape

```text
VoyagerInterface
      |
app/api/chat/route.ts -- resolveSessionVoyage -- active voyage authority
      |
createVoyagerTools
      +-- semantic_search / keyword_grep / anchored_search / get_nodes
      +-- room, message, voyage, account, captain and background tools
      |
Supabase
      +-- knowledge_events      append-only source content
      +-- knowledge_current     derived search and embedding state
      +-- voyages / spaces      product authority
      +-- message_deliveries    destination delivery state
      +-- graph_nodes / graph_edges / graph_authority_edges   the one graph
      +-- knowledge_audiences   immutable scope carried by every source event
      +-- knowledge_source_intents   the exactly-once ingress claim
```

`lib/retrieval/voyager-tools.ts` is the registered tool catalogue.
`lib/retrieval/knowledge-retrieval-tools.ts` defines the knowledge retrieval
tools. The K2 cutover removed the legacy `knowledge_edges` table, its
`graph_traverse` RPC and every caller, so no registered tool traverses the graph
today; the six-kind boundary in `lib/knowledge/kernel/boundary.ts` still uses an
isolated candidate client and gains its live caller in K3.

`lib/messaging/ingress.ts` is the only path by which a person's message becomes
a fact. It resolves the audience, then calls one database function that claims
actor + transport + client message id + payload hash BEFORE writing the
audience, the event, its graph identity, its structural edges and the delivery
outbox in a single transaction.

Every registered service-role knowledge read crosses a caller-scoped RPC.
Exact-ID hydration uses `get_knowledge_by_ids`; direct mentions use
`get_voyage_messages`; neither registered path reads `knowledge_current`
through the admin client. PostgreSQL rechecks active voyage membership when the
query executes, including graph roots and every traversal frontier.

## Event-sourced knowledge

`knowledge_events` is the sole ledger containing event content. Events are
append-only apart from the deliberately bounded audience transition described
below. `knowledge_current` is a derived projection used by semantic and keyword
retrieval. `knowledge_units` contains extracted claims and immutable provenance;
each unit has exactly the same audience as its source event.

Source visibility is represented by an immutable `knowledge_audiences` row:

```text
id = canonical(purpose, scope kind, scope authority, sorted members)
purpose = source | authority
scope = private | voyage | space
members = exact immutable profile-id snapshot
```

Source audiences authorize content. Authority audiences describe a current
product snapshot used to validate the graph projection; they do not authorize
historical source content.

## Canonical graph substrate

The candidate schema in `recipes/sql/knowledge-graph/057`–`063` is final-shaped
but not installed. Product migration files currently end at `059`, but numeric
discovery is not installed-state authority. The pre-054 catalogue contract is
the explicit boundary for applying product migrations 054–059; no live caller
depends on candidate SQL.

### Stable identities

`graph_nodes` contains one scope-neutral row for each `(kind, authority_id)`.
The six kinds are Person, Voyager, Voyage, Space, MessageEvent, and
KnowledgeUnit. The physical UUID is canonical and checked by PostgreSQL. A
Person participating in many disjoint scopes still has one node.

`graph_node_grants` is immutable evidence that an audience may discover a
stable identity. A grant stores basis kind/id/version, optional evidence event,
the label at grant time, and grant time. It never grants source content or
current membership.

Grant bases are typed:

- `source_event` is valid only for a MessageEvent bound to itself or a
  KnowledgeUnit bound to its exact source.
- `edge_evidence` is valid only for a structural endpoint of the exact immutable
  edge/evidence event/audience tuple.
- `profile`, `voyage_member`, `space_member`, and `space` mirror exact product
  authority rows and revisions.

### Historical relations

`graph_edges` stores canonical immutable semantic, source, and provenance
relations. Its stable edge ID derives from canonical endpoints and kind;
`relates_to` canonicalizes endpoint order. Every usable edge has one or more
`graph_edge_evidence` rows pointing to exact source events. An edge has no
synthetic intersection audience and cannot manufacture endpoint grants.

### Current authority projection

`graph_authority_edges` is rebuildable current state for only `member_of`,
`in_voyage`, and `companion_of`. Product triggers project the authoritative row
ID, exact revision, state, effective time, authority audience, and projection
time. Traversal rechecks the live product row and exact revision/state/time, so
the graph cannot grant membership.

Voyage and space membership rows are retained across leave/rejoin. Only
`state = 'active'` is current membership. Space-member physical IDs are derived
from `(space_id, user_id)`; ordinary inserts omit the generated ID. Legitimate
parent deletion and cascade remove current authority edges while immutable
grants remain as historical evidence.

For a voyage-backed room, effective authority requires both an active child
space membership and an active parent voyage membership. Leaving a voyage
atomically retires child-room memberships; rejoining the voyage does not revive
them. A fresh room invitation is required. Standalone spaces remain valid.

Every fresh invitation event carries its exact `space_id`, and the response
transition requires that identity. Migration `057` retires every pending
pre-cutover membership because older immutable invitation events cannot identify
which room they meant. The feed keeps those events as honest, non-actionable
history and asks for a resend; it never guesses from a newer membership.

Accepting an exact room invite commits the membership and responding-session
link in one database transition. The join announcement is a separate, best-effort
post-commit effect: immediately before creating the event, the application
rechecks that the joiner is still in the effective room roster. A joiner who
has already lost authority produces no event or delivery. Membership may still
change after that check, so the announcement is a presence signal, not an
atomic audit record of continued membership.

Profile and voyage source triggers are the sole writers of their current node
labels. Membership and space projectors may reference canonical nodes but must
not refresh those labels from stale row snapshots.

## Traversal privacy

The database authorizes the root before returning it. Each historical hop then
requires all of:

1. an evidence event visible to the viewer;
2. endpoint grants in that exact evidence audience;
3. exact edge/evidence bases for structural endpoints; and
4. exact source-audience checks for MessageEvent and KnowledgeUnit endpoints.

Authority hops require a current, exact product projection plus endpoint grants
in its authority audience. Historical-only roots return `label_snapshot`; a
current authorized root may return `graph_nodes.label`.

Denied traversal and graph-off retrieval expose no content, count, path,
placeholder, evidence, edge metadata, or provenance and share a padded response
class at the database boundary. The application boundary returns only exact
claim and immutable source fields.

## Migration and release boundary

Migrations 001–053 are deployed history and are immutable. Deployable `054`–
`059` harden active membership, installed retrieval, exact-room invites and
responses (including retirement of ambiguous pending rows), private-reply
promotion, and session authority cleanup without
creating graph tables. The proof-owned graph `057`–`063` is exercised only
inside `recipes/knowledge-graph-poc.sh` and rolled back.
Candidate migration 060 removes the old event-only graph runtime only inside
that future clean-cut transaction.
The installed Supabase contract contains only tables/functions discovered
through 059. Candidate graph tables and RPCs use a separate proof client, so a
future type cannot make an absent production object appear live.
Projection functions are defined before activation; activation takes
transaction-held writer locks, installs triggers, and performs a complete
idempotent catch-up so writes before the lock are not lost.

The candidate must not release before K2. Current production ingress still
writes an event before best-effort downstream work. K2 must atomically create
the canonical source audience, event, MessageEvent node, grants, structural
edges, evidence, and delivery fan-out; backfill deployment-gap events; then set
the audience column `NOT NULL`. Until then, a null event audience may be assigned
one canonical audience once, after which it is immutable.

Event `user_id` and `actor_id` references deliberately restrict account
deletion while immutable ledger rows exist. K5 must define an explicit
erasure/anonymization contract before that terminal state can change; deletion
must never occur as an accidental cascade around the immutable ledger.

## Proof boundary

The kernel fixture exercises all six node kinds and all sixteen edge kinds,
cross-scope identity, red/blue denial symmetry, historical labels, leave,
late join, absence, rejoin, post-rejoin sources, deterministic replay, parent
cascades, and direct-write rejection. The hosted recipe adds K1 canonical
backfill parity, unresolved-row reporting, activation-gap catch-up, sequence
non-consumption, old-catalogue absence, and catalogue equality after rollback.
