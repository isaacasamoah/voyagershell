# Proving recipes — ORU-447 Named Voyagers + Addressing Grammar

Deterministic, shell-runnable recipes that simulate the human verification of
this cut. Objective grading runs on the spine; the two-account bench is the
human-equivalent check the Spec gate required. Unit tests support these — they
do not replace them.

## Objective (shell, on the spine)

| Recipe | Asserts | Marker |
|---|---|---|
| `./recipes/address-grammar.sh` | @own=aside · @other=redirect (never aside) · leading-name=summon · mid-sentence=neither · @voyager alias parity · **@unknown / @typo / @human = held (never fanned out)** | `ADDRESS_GRAMMAR_GREEN` |
| `./recipes/two-account-bench.sh` | Two accounts, one names "wren": @wren aside private to its owner **verified from the other account**, summon addressed, @other redirect, mid-sentence nothing — real data-layer assembly → real resolver | `TWO_ACCOUNT_BENCH_OK` |
| `./recipes/handles-uniqueness.sh` | `idx_handles_lower` rejects a cross-case dup on dev (non-mutating; requires `~/.supabase/access-token`) | `HANDLES_UNIQUE_OK` |
| `./recipes/typecheck.sh` | `tsc --noEmit` clean | `TYPECHECK_OK` |
| `./recipes/full-suite.sh` | the full unit suite | `FULL_SUITE_GREEN` |
| `./recipes/public-voice.sh` | **cut ④** — fan-out plan + owner-anchored attribution (§6.5, riskiest) on the REAL stream-context mapper + loop guard | `PUBLIC_VOICE_POC_GREEN` |
| `./recipes/public-voice-room-bench.sh` | **cut ④ Test-gate primary** — the two-account fambam ritual (LLM via chh), backed by deterministic DB assertions: public fan-out under the owner + deliveries, loop guard (no voyager reply chained off a voyager reply), aside stays participants=[asker]. Runbook mode prints the ritual; assertion mode needs `PUBLIC_VOICE_BENCH_SESSION_ID` + `~/.supabase/access-token` | `PUBLIC_VOICE_ROOM_BENCH_OK` |

## Human residual (browser, two-account fambam — optional for Isaac)

Two signed-in accounts (e.g. Isaac + Elisheya) in one room:

1. Account A: name your Voyager — "call you Wren" (or via the composer). Confirm the naming line.
2. Account A: type `@wren …` — the composer shows **→ private aside to Wren**; send it; only A sees the reply (B's feed does not).
3. Account B: type `@wren …` — **no** private-aside badge; the message posts to the room and A/B see the gentle redirect ("wren is Isaac's Voyager — @ only reaches your own…"). No private line into A's Voyager opens.
4. Account B: type `wren, …` — the summon is addressed (leading-name).
5. Either account: a mid-sentence "wren" does nothing.
6. **The typo case (the Test Gate regression).** BEFORE naming the Voyager — or with any mis-typed handle, e.g. `@wrne <secret>` or `@wren <secret>` before `wren` exists — Account A types it and sends. The words **do NOT** reach Account B's feed; A gets a private notice ("No one called "wrne" is here — say it without the @ to send it to the room."). Nothing fans out. This is the confidentiality guard the Test Gate required.
