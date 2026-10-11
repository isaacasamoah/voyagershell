# Knowledge and graph architecture

[Architecture overview](../../ARCHITECTURE.md) · [Migration foundations](migrations.md)

## Event-sourced knowledge

`knowledge_events` is the sole ledger containing event content. Events are
append-only apart from the deliberately bounded audience transition described
below. `knowledge_current` is a derived projection retained by the event system.
Current semantic and keyword retrieval read authorized `knowledge_units` through
database functions. Units contain extracted claims and immutable provenance;
each unit has exactly the same audience as its source event.

Service-role retrieval must cross the database authorization boundary. Exact-ID
unit hydration uses `search_knowledge_units` with `p_unit_ids`; direct voyage
message retrieval uses the caller-authorized `get_voyage_messages` function.
Neither path may hydrate `knowledge_current` directly through the admin client.
PostgreSQL rechecks the viewer's audience, grants and current membership as
required by the query when it executes.

An ordinary Voyager response inherits the exact immutable audience of its
claimed human source event. Its graph attribution is `generated_by` the owner's
Voyager, not `authored_by` the person. A synthetic welcome has no human source
and is restricted to the owner-private conversation shape.

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

Migrations `061`–`076` established the graph and memory-kernel foundations. Numeric
discovery is not installed-state authority: the pre-054 catalogue contract
remains the explicit boundary for applying product migrations `054`–`059`, and
the local proofs then apply each later migration in order.

### Stable identities

`graph_nodes` contains one scope-neutral row for each `(kind, authority_id)`.
The seven kinds are Person, Voyager, Voyage, Space, MessageEvent, KnowledgeUnit,
and Topic. The physical UUID is canonical and checked by PostgreSQL. A Person
participating in many disjoint scopes still has one node.

`knowledge_topics` is the immutable authority table for Topic nodes. It owns
the normalized label and 1536-dimensional embedding; every Topic graph node
must reference one exact authority row. Active topic identity does not classify
against that vector: migration `075` blocks over the claim embeddings of
authorized units already filed under each topic and returns the nearest claim
as matcher context.

`knowledge_topic_identity_outcomes` is the backfill ledger for pre-v4 units
only. Live v4 units do not write an outcome row there: their topic decisions are
the KnowledgeUnit-to-Topic edges, evidence, and grants written atomically inside
`complete_v4_knowledge_extraction_attempt`.

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

Topic nodes are shared hubs. Each KnowledgeUnit-to-Topic `about` edge carries
its exact source-event evidence, and the Topic receives one grant per
authorizing source audience. Sharing a topic identity never widens access:
viewers discover only the incident units and degree authorized by their own
audiences.

Conflict discovery is a separate, versioned per-person pass. A committed
KnowledgeUnit enqueues one `knowledge_relation_jobs` row for each person in its
immutable source audience. `begin_relation_attempt` selects topic siblings and
claim-vector neighbors that person can read and persists the exact ordered
unit IDs before either model call. The leased attempt also returns the database
contract's prompts, verdicts, and candidate cap; the runtime refuses a version
it does not implement and records a retryable failed attempt without calling a
model. Attempts and their K3-shaped outcomes are immutable; provider failures
retry only to the contract cap, after which the job is completed without a
retained lease. A commit rejected because candidate authorization changed is
also re-queued to rebuild the snapshot; every other commit rejection is
terminal. The bounded migration backfill records whether it completed or was
skipped because the existing unit-by-person fanout exceeded its install-time
cap.

The only discovery writer is `complete_relation_attempt`. It may add
`contradicts` or `supersedes` edges between KnowledgeUnits, both endpoint
events as evidence, and an assertion containing every unit the judgment read.
It cannot add grants, `about` or structural edges, or the dormant agreement
kinds. Relation traversal uses an assertion only when the viewer independently
belongs to the immutable source audience behind every recorded input unit's
historical grant. Existing historical and authority hops keep their prior
authorization rules. A `supersedes` edge is a discovered candidate for later
truth machinery; it does not hide, demote, or rewrite either immutable unit.

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

## Later changes

Migrations 078–084 extend these foundations with unit lifecycle and reads,
search backfill, the event-native cutover, session repair and versioned extractor
contracts. See [the migration sources](../../supabase/migrations/) and
[the runtime boundary](../../lib/knowledge/kernel/boundary.ts) for the current
contract. Source files and old receipts do not establish hosted deployment state.

## Migration and release boundary

Migrations 001–053 are deployed history and are immutable. Migrations `054`–
`059` harden active membership, installed retrieval, exact-room invites and
responses, private-reply promotion, and session authority cleanup. Migrations
`060`–`071` are one graph-and-ingress release boundary: source intent, canonical
graph substrate, clean cutover, authority projection, atomic human ingress,
deployment-gap recovery, and source-audience inheritance for Voyager replies.
Projection functions are defined before activation; activation takes
transaction-held writer locks, installs triggers, and performs a complete
idempotent catch-up so writes before the lock are not lost.

Migrations `072`–`076` add the event-owned Cartographer, the registered graph
memory read, Topic authority nodes, and the re-derived v4 topic matcher.
Migration `074` remains the structural topic migration. Migration `075`
separates claim-vector blocking from identity: a versioned model instruction
reuses an authorized candidate or proposes a new label, and only the server
writes. Migration `076` hardens candidate snapshots, completion authority,
backfill ACLs, and topic-only rework. Activation drains pinned older jobs before
re-deriving pre-v4 units, removing falsified topic assignments, and asserting
complete physics, topics, and zero orphan authority rows.

The atomic writer creates the canonical source audience, event, MessageEvent
node, grants, structural edges, evidence, and delivery fan-out before returning.
Deployment-gap recovery binds the only permitted null-audience rows, after
which the event audience is immutable. Voyager responses cross that same writer:
normal replies inherit the exact source audience, and synthetic welcomes are
accepted only with one owner member and no recipients.

Event `user_id` and `actor_id` references deliberately restrict account
deletion while immutable ledger rows exist. K5 must define an explicit
erasure/anonymization contract before that terminal state can change; deletion
must never occur as an accidental cascade around the immutable ledger.

## Proof boundary

The historical K2 kernel fixture exercises its six node kinds and all sixteen edge kinds,
cross-scope identity, red/blue denial symmetry, historical labels, leave,
late join, absence, rejoin, post-rejoin sources, deterministic replay, parent
cascades, and direct-write rejection. The hosted recipe adds K1 canonical
backfill parity, unresolved-row reporting, activation-gap catch-up, sequence
non-consumption, old-catalogue absence, and catalogue equality after rollback.
The disposable K4b recipe separately proves the seventh Topic kind, canonical
topic authority, shared-hub privacy, stale-mint re-matching, adjacent-subject
separation, and ordered zero-residue backfill. The committed model harness
measures the exact matcher contract over real OpenAI claim embeddings.
