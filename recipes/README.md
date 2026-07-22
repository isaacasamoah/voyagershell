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
