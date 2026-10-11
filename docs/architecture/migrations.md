# Migration foundations

[Architecture overview](../../ARCHITECTURE.md) · [Current migration recipes](../../recipes/README.md)

This explains the installed-state and graph-ingress boundaries introduced by
migrations 054–071. Later migrations build on them; this is not a deployment
status report or a command to apply them.


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
`lib/supabase/types.ts` remains the application database contract. The local
installed-authority proof constructs a deterministic pre-054 subset, runs the
precondition, applies only 054–059, and derives the scoped post-migration
catalogue/type/ACL contract from real `pg_catalog`; it does not claim to
reproduce unrelated hosted objects. The graph proof then applies the complete
060–071 boundary to a disposable database in release order.

K2 makes ordinary message ingress atomic: it creates the canonical source
audience, event, message node, endpoint grants, historical edges, evidence, and
fan-out in one transaction. It recovers deployment-gap events and enforces
`knowledge_events.knowledge_audience_id NOT NULL`. The bounded
`NULL -> canonical audience` transition exists only inside that recovery; any
second audience change is rejected. Migration `070` cleanly replaces the old
assistant writer: a real reply inherits its human source audience in the same
atomic ingress, while a source-less synthetic welcome is restricted to the
owner-private conversation shape. Migration `071` aligns deployment-gap
assistant graph structure with that writer.

