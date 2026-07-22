# Proving recipes — Private Voyager trust contract

Deterministic, shell-runnable recipes that simulate the human verification of
this cut. Objective grading runs on the spine; the two-account bench is the
human-equivalent check the Spec gate required. Unit tests support these — they
do not replace them.

## Objective (shell, on the spine)

| Recipe | Asserts | Marker |
|---|---|---|
| `./recipes/address-grammar.sh` | @own=private · every other @=held · all leading names=ordinary room text · client/server audience parity | `ADDRESS_GRAMMAR_GREEN` |
| `./recipes/two-account-bench.sh` | Two accounts, one names "wren": owner can invoke; other account cannot; leading name remains human room text | `TWO_ACCOUNT_BENCH_OK` |
| `./recipes/private-voyager-trust.sh` | Owner-private turn persistence + content-only human Share-to-room boundary + private background results | `PRIVATE_VOYAGER_TRUST_GREEN` |
| `./recipes/handles-uniqueness.sh` | `idx_handles_lower` rejects a cross-case dup on dev (non-mutating; requires `~/.supabase/access-token`) | `HANDLES_UNIQUE_OK` |
| `./recipes/knowledge-graph-poc.sh` | Existing `knowledge_events` ledger · six canonical kinds · all 16 edge kinds · exact claim/source DB retrieval · metadata/timing denial · transaction rollback leaves zero catalogue residue | `KNOWLEDGE_GRAPH_POC_GREEN` |
| `./recipes/typecheck.sh` | `tsc --noEmit` clean | `TYPECHECK_OK` |
| `./recipes/full-suite.sh` | the full unit suite | `FULL_SUITE_GREEN` |

## Human residual (browser, two-account fambam — optional for Isaac)

Two signed-in accounts (e.g. Isaac + Elisheya) in one room:

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

After migration 053 is installed, `recipes/private-reply-promotion-proof.sql` is the rollback-only database proof for created/replayed idempotency, exact content-only publication, one mapping, and one delivery per recipient.

## Phase 2 knowledge-graph Spec gate

From any directory, run:

```bash
/Users/isaac/the-workshop/voyagershell-oru-319-memory-kernel/recipes/knowledge-graph-poc.sh
```

The recipe takes `VOYAGER_SUPABASE_ACCESS_TOKEN` first, then the canonical Mac
token file, then securely reads the Fedora token. It sends one Management API
transaction containing the ordered schema and authorization migrations (054 and
055), two fixed source rows in the existing `knowledge_events` ledger, both
fixture projections, and every SQL assertion, then rolls the whole transaction
back. It refuses to start if any target object exists and compares the catalogue
before and after.

Expected stable observation summary:

```text
knowledge-graph: existing knowledge_events ledger | 2 fixed sources | participants NULL
knowledge-graph: 6 kinds | 10 nodes | 25 edges | replay identical
knowledge-graph: graph on found "Vanessa keeps the amber notebook behind the blue atlas." with immutable source; graph off missed it
knowledge-graph: 16 edge kinds | six-root DB RPC | metadata denied
knowledge-graph: root denied | hidden bridge denied | timing class equal | victim private residue 0 | NULL denied
knowledge-graph: NULL-audience source rejected | Person + Voyager rename stable | catalogue residue 0
KNOWLEDGE_GRAPH_POC_GREEN
```
