# Proving recipes — Private Voyager trust contract

Deterministic, shell-runnable recipes that simulate the human verification of
this cut. Objective grading runs on the spine; the two-account bench is the
human-equivalent check the Spec gate required. Unit tests support these — they
do not replace them.

## Objective (shell, on the spine)

| Recipe                               | Asserts                                                                                                                                                                                                                 | Marker                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `./recipes/address-grammar.sh`       | @own=private · every other @=held · all leading names=ordinary room text · client/server audience parity                                                                                                                | `ADDRESS_GRAMMAR_GREEN`       |
| `./recipes/two-account-bench.sh`     | Two accounts, one names "wren": owner can invoke; other account cannot; leading name remains human room text                                                                                                            | `TWO_ACCOUNT_BENCH_OK`        |
| `./recipes/private-voyager-trust.sh` | Owner-private turn persistence + content-only human Share-to-room boundary + private background results                                                                                                                 | `PRIVATE_VOYAGER_TRUST_GREEN` |
| `./recipes/authority-projection-concurrency.sh` | Disposable local two-session voyage/space membership serialization against exact authority migrations | `AUTHORITY_PROJECTION_CONCURRENCY_GREEN` |
| `./recipes/knowledge-graph-cutover-concurrency.sh` | Disposable authenticated legacy-writer overlap with lossless rejection evidence and post-cutover RPC writer | `KNOWLEDGE_GRAPH_CUTOVER_CONCURRENCY_GREEN` |
| `./recipes/private-reply-promotion-concurrency.sh` | Disposable publication-first, parent-voyage-revocation-first, and room-membership-revocation-first row-lock serialization | `PRIVATE_REPLY_PROMOTION_CONCURRENCY_GREEN` |
| `./recipes/private-reply-promotion-integrity.sh` | Session-authority mismatch denial, authenticated tamper denial, exact 053 FK actions, and both promotion/space-delete orders | `PRIVATE_REPLY_PROMOTION_INTEGRITY_GREEN` |
| `./recipes/room-invite-authority-concurrency.sh` | Exact-room first invite, missing-room denial, invited/active idempotency, re-invite, atomic accept/decline, parent-leave orders, and effective-authority re-entry | `ROOM_INVITE_AUTHORITY_CONCURRENCY_GREEN` |
| `./recipes/session-authority-concurrency.sh` | Session-RPC-first and voyage/space-revocation-first serialization through current membership locks | `SESSION_AUTHORITY_CONCURRENCY_GREEN` |
| `./recipes/knowledge-graph-local-proof.sh` | Installed 054–071 in cutover order, with the deployment gap written before activation, plus generated K0/K1 assertions | `KNOWLEDGE_GRAPH_LOCAL_GREEN` |
| `./recipes/installed-schema-authority.sh` | Sealed 001–053 source bytes, one pre-054 installed-state contract, legacy-invite retirement with immutable ledger proof, ordered 054–059 application, post-migration catalogue/type/ACL evidence, retrieval leave/rejoin, session denial, and bounded graph traversal | `INSTALLED_SCHEMA_AUTHORITY_GREEN` |
| `./recipes/source-intent-exactly-once.sh` | K2/C7: 25 concurrent identical ingress requests yield exactly one claim, one event and one binding; same key + different payload is rejected with no residue; an identical retry replays the winner | `SOURCE_INTENT_EXACTLY_ONCE_GREEN` |
| `./recipes/atomic-ingress-exactly-once.sh` | K2/C7: 25 concurrent identical requests through the real cutover yield exactly one event, audience, node, grant, structural pair and delivery; same key + different payload is rejected with no residue; a deployment-gap event is recovered and a rerun recovers nothing; the legacy table and traversal RPC are both absent | `ATOMIC_INGRESS_EXACTLY_ONCE_GREEN` |
| `./recipes/cartographer-k3-local-proof.sh` | K3: event-owned eligibility, one-winner leases, expired-attempt recovery, idempotent completion, claim conflict safety, audience inheritance, one unit with `derived_from` and optional `about`, immutable outcomes, and denied role access in exact disposable PostgreSQL | `CARTOGRAPHER_K3_LOCAL_GREEN` |
| `./recipes/typecheck.sh`             | `tsc --noEmit` clean                                                                                                                                                                                                    | `TYPECHECK_OK`                |
| `./recipes/full-suite.sh`            | disposable K3 structural proof followed by the full unit/contract suite                                                                                                                                                  | `FULL_SUITE_GREEN`            |

## Hosted runners

Hosted recipes are isolated under `recipes/hosted/` and never belong in CI or
a local/disposable battery:

| Class | Runner | Additional confirmation |
|---|---|---|
| Mutating | `hosted/mutating/handles-uniqueness.sh` | `VOYAGER_ALLOW_HOSTED_MUTATION=1` |
| Read-only | `hosted/read-only/installed-precondition-live.sh` | none |
| Rollback | `hosted/rollback/knowledge-graph-poc.sh` | `VOYAGER_ALLOW_HOSTED_ROLLBACK=1` |
| Rollback | `hosted/rollback/privacy-backstop-proof.sh` | `VOYAGER_ALLOW_HOSTED_ROLLBACK=1` |

Every hosted runner requires `VOYAGER_SUPABASE_PROJECT_REF` to equal the
separately reviewed `VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF` before it reads
`VOYAGER_SUPABASE_ACCESS_TOKEN` or invokes the Management API. There are no
default targets, embedded project refs, token-file fallbacks, or SSH fallbacks.

## Required browser contract (two accounts — a gate, not a residual)

This is not optional residual work. No K checkpoint closes on
the shell ring alone: the ring proves database and contract shape, and it has
already been observed going green against a schema the product does not run.
The browser run is the only place the whole product is exercised, so a
checkpoint is complete only when this contract has been driven end to end on the
exact sealed candidate, with every step observed and no executable step left for
a human to perform later.

**Bench.** Run the candidate against the explicitly authorized development
database, never production. Use two invited test accounts that are active in
one room. Point the worktree's own `.env.local` at that development target; a
`git worktree add` does not carry env files. Applying candidate migrations to
production merely to satisfy a test is forbidden.

**Two isolated sessions, one browser.** `localhost` and `127.0.0.1` are distinct
cookie and localStorage origins, so account A signs in on
`http://localhost:<port>` and account B on `http://127.0.0.1:<port>` without a
second browser profile and without either session seeing the other. Sign-in goes
through the app's real magic-link callback; mint the link server-side so the
one-time token never reaches a transcript, a log, or a fixture.

**Recording.** Capture the candidate fingerprint, both origins, the ordered
actions, the observations, decision-point screenshots, and the browser console
and dev-server logs. A silent server-side error (an RPC falling back to a
degraded path) counts as a failure even when the interface looks correct, so
read the logs, do not just read the screen.

Two signed-in test accounts in one room:

1. Account A: name your Voyager — "call you Wren" (or via the composer). Confirm the naming line.
2. Account A: type `@wren …` — the composer shows **→ private aside to Wren**; send it; only A sees the reply (B's feed does not).
3. Account B: type `@wren …` — the composer says **Not sent · only your Voyager can be invoked**. Send it; A sees nothing and no model turn opens.
4. Account B: type `wren, …` — the composer says **This room**; send it; both people see an ordinary message from B and no Voyager replies.
5. Account A: ask `@wren …`; on Wren's private reply, choose **Share to this room**, review the exact preview, and confirm. Both people see a new message attributed to A; neither sees A's private prompt or retrieval provenance.
6. Reload both accounts. The private exchange remains absent from B. The human shared message remains present for both.
7. Type `@wrne <secret>` from either account. It is held with the same **Not sent** audience and does not reach the other feed.
8. Account B removes Account A from the room. Both audience indicators converge to no room audience. A plain message from A becomes a private Voyager turn and never appears for B; A cannot share, invite, remove, or change the old room through its retained session.
9. Account A asks a private question that needs memory retrieval and causes at least `keyword_grep → get_nodes`. Voyager completes the answer without a UUID lookup error or a Maximum update-depth error; the reply remains private until explicitly shared.
10. Share the same private Voyager reply twice. Exactly one room message appears; the second call reports a replay, and the original reply remains marked **Shared** after reload. Moving the source session to a different room makes that room a distinct destination and permits one new publication there.
11. Name or rename the owner Voyager. Its live answer and all owner-private historical replies immediately use the current name; the `@name` private address changes without reload. Historical public Voyager messages keep the name stored when they were published.
12. Both accounts reload. Each still resolves its own voyage list and the shared room; the room history is present for both with correct attribution and order.
13. At a 390 × 844 viewport the page never scrolls horizontally (`documentElement.scrollWidth === clientWidth`), and the composer audience line stays legible.
14. Read the dev-server log for the whole run. Semantic retrieval reports a non-zero `semantic=` count; a `Search error` or a silent fall back to keyword-only is a failure.

After migration 053 is installed,
`recipes/sql/private-reply-promotion-proof.sql` is the rollback-only database
proof for created/replayed idempotency, exact content-only publication, one
mapping, and one delivery per recipient.

## Local authority-projection concurrency

Prerequisites: a running Docker daemon and the fixed multiarch
`pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee` image
already present locally. Run `./recipes/authority-projection-concurrency.sh`.
The recipe never pulls, publishes a host port, or joins a network. It constructs
the same deterministic pre-054 baseline used by every K1 PostgreSQL recipe,
runs the shared read-only precondition, applies the required product migration
plus proof-only projection files to one disposable container, and proves real
advisory-lock contention for voyage and space memberships, checks final product
rows, canonical authority audiences and current edges, then removes the container.
The cutover, promotion and full-candidate recipes have the same prerequisites
and isolation rules; each names its own unique container and removes it on every
exit path.

## Installed-state authority

`./recipes/installed-schema-authority.sh` requires the
`pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee`
image to exist locally. Pull that exact image
outside the recipe with
`docker pull pgvector/pgvector@sha256:18d16372b8406bb38a9f94cbff15d125c463d71fde2770aa8b5c64bfcc1578ee`,
then run the recipe. The recipe
uses `--pull=never` and never publishes a host port or joins a network. It
mechanically compares migrations 001–053 with reviewed revision
`c7e1199222f519e60999eb7c9037368f297d115a`; that is a source-byte seal, not a
claim that the numbered folder is replayable or is the installed-state ledger.
The recipe constructs one deterministic pre-054 baseline, composes the
`installed-pre-054-precondition/` fragments in their canonical order, applies
only product migrations 054–059 in order, then derives and enforces the scoped
post-migration catalogue/type/ACL contract from `pg_catalog`. The precondition
allows the two memory cleanup functions to be absent or to have only the exact
legacy identities that 054 drops; the postcondition proves their complete
absence. Finally the recipe proves callable ACLs, anonymous and cross-user
denial, retirement of a pre-cutover pending invite without changing its ledger
event, a fresh exact-space invite response, membership leave/rejoin, hidden
graph roots and bridges, and the traversal node budget. The baseline
deliberately models only facts required by 054–059 and these assertions; it is
not a synthetic full database dump.

The human Spec and Test gates additionally run the same precondition against
the linked Supabase project:

```bash
./recipes/hosted/read-only/installed-precondition-live.sh
```

The checker accepts the access token only from
`VOYAGER_SUPABASE_ACCESS_TOKEN` and the project ref only from
`VOYAGER_SUPABASE_PROJECT_REF`. The target must exactly match
`VOYAGER_AUTHORIZED_SUPABASE_PROJECT_REF`. It submits only the read-only SQL
contract to Supabase's official Management API, redacts failures, and never
embeds project identity. Its one request uses the Management API read-only
query endpoint, with no write-path fallback. It has no token-file or SSH
fallback. It is network-free until a human explicitly invokes it, and remote
CI never requires personal secrets.
A missing image, environment value, network response, safe specific failure
identifier, or non-exact green marker is a dependency failure, never
installed-state success.

## Phase 2 knowledge-graph Spec gate

From any directory, set the target, its independently reviewed authorization,
the injected token, and the rollback confirmation before running:

```bash
./recipes/hosted/rollback/knowledge-graph-poc.sh
```

The target must exactly match the separately supplied authorized ref before
credential discovery or any API call. The recipe accepts the access token only
from `VOYAGER_SUPABASE_ACCESS_TOKEN`. It writes the token to a mode-0600
temporary header file and immediately unsets the shell variables, so the bearer
value never enters curl's arguments. It sends one Management API
transaction containing deployable product authority hardening 054–059,
graph schema/authorization/retrieval 061–063, fixed eligible and deliberately
unresolved legacy scenarios in a fresh run-scoped UUID namespace, the cutover
064, an explicit between-file write, projection definition/activation in
065–067, atomic ingress plus deployment-gap recovery in 068–069, and private
Voyager response audience inheritance and recovery alignment in 070–071. It then
runs the expanded fixture and every SQL assertion before rolling the whole
transaction back. It permits the hosted legacy catalogue at entry, refuses any
already-installed target, proves the replaced table and both old RPC signatures absent
inside the transaction, and compares the full old+new target catalogue before
and after rollback. Every proof event has a reserved negative sequence number;
a same-session guard proves the proof did not initialize or advance the
production event sequence.

Expected stable observation summary:

```text
knowledge-graph: existing knowledge_events ledger | 3 fixed sources | participants NULL
knowledge-graph: 6 kinds | 18 nodes | 18 historical edges | replay identical
knowledge-graph: graph on found "Vanessa keeps the amber notebook behind the blue atlas." with immutable source; graph off missed it
knowledge-graph: 16 edge kinds | six-root DB RPC | metadata denied
knowledge-graph: root denied | hidden bridge denied | timing class equal | victim private residue 0 | NULL denied
knowledge-graph: NULL source excluded then assigned once | Person + Voyager rename stable | residue 0
knowledge-graph: K1 exact backfill parity | unresolved rows outside graph and reported
knowledge-graph: multi-scope identity | locked catch-up | leave/rejoin | cascade-safe history
knowledge-graph: final writer + retrieval green | old graph catalogue absent | rollback identical
KNOWLEDGE_GRAPH_POC_GREEN
```

The fixed scenario keeps one Person node across disjoint Red and Blue scopes,
then proves leave, rename, late join, absence-only source, rejoin and post-rejoin
source behavior. Historical-only discovery returns the immutable grant label;
current authorized viewers receive the current registry label. Direct grant,
evidence and authority-projection writes are denied to `service_role`.

Migrations 060–071 are one release boundary. They create the source audience,
event, MessageEvent node, grants, historical edges/evidence and fan-out inside a
single claiming transaction, and recover any deployment-gap events written by
the old ingress before the application deployed. Voyager responses use the same
claiming transaction, inherit their human source audience exactly, and create a
`generated_by` edge to the canonical Voyager node. The rollback proof verifies one
ordinary null-audience event can receive its canonical audience once and enter
the graph, while a second audience change fails.

The hosted rollback runner deliberately refuses when the cutover is already
installed on its authorized target. Use `knowledge-graph-local-proof.sh` for
the same evidence on a disposable database.

## K4b topic nodes and backfill

`cartographer-k4b-local-proof.sh` installs the exact through-073 baseline,
migration 074, a falsified-v3 residue fixture, and migrations 075–076 in one
disposable, no-network pgvector container. It proves model-selected topic
execution, a real stale concurrent-mint retry, adjacent-subject separation,
shared-hub audience visibility, both pointer cutover orderings, the ordered
old-job drain and zero-residue unit re-derivation, and role denial. Expected
verdict:

```text
CARTOGRAPHER_K4B_LOCAL_GREEN
```

The real-vector/model harness uses `OPENAI_API_KEY` and the exact checked-in
matcher contract:

```bash
python3 recipes/experiments/topic-exp1.py
python3 recipes/experiments/topic-exp2.py
python3 recipes/experiments/topic-exp3.py
```

`npm run memory:k4b-backfill` is the explicit live operation, not part of the
local proof. It activates v4, drains pre-v4 jobs through their pinned
Cartographer contracts, re-derives every pre-v4 unit, then runs the
zero-residue assertion. Run it only against an explicitly authorized target
after migrations 074 and 075 have been reviewed and applied.
