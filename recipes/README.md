# Proving recipes — ORU-447 Named Voyagers + Addressing Grammar

Deterministic, shell-runnable recipes that simulate the human verification of
this cut. Objective grading runs on the spine; the two-account bench is the
human-equivalent check the Spec gate required. Unit tests support these — they
do not replace them.

## Objective (shell, on the spine)

| Recipe | Asserts | Marker |
|---|---|---|
| `./recipes/address-grammar.sh` | @own=aside · @other=redirect (never aside) · leading-name=summon · mid-sentence=neither · @voyager alias parity | `ADDRESS_GRAMMAR_GREEN` |
| `./recipes/two-account-bench.sh` | Two accounts, one names "wren": @wren aside private to its owner **verified from the other account**, summon addressed, @other redirect, mid-sentence nothing — real data-layer assembly → real resolver | `TWO_ACCOUNT_BENCH_OK` |
| `./recipes/handles-uniqueness.sh` | `idx_handles_lower` rejects a cross-case dup on dev (non-mutating; requires `~/.supabase/access-token`) | `HANDLES_UNIQUE_OK` |
| `./recipes/typecheck.sh` | `tsc --noEmit` clean | `TYPECHECK_OK` |
| `./recipes/full-suite.sh` | the full unit suite | `FULL_SUITE_GREEN` |

## Human residual (browser, two-account fambam — optional for Isaac)

Two signed-in accounts (e.g. Isaac + Elisheya) in one room:

1. Account A: name your Voyager — "call you Wren" (or via the composer). Confirm the naming line.
2. Account A: type `@wren …` — the composer shows **→ private aside to Wren**; send it; only A sees the reply (B's feed does not).
3. Account B: type `@wren …` — **no** private-aside badge; the message posts to the room and A/B see the gentle redirect ("wren is Isaac's Voyager — @ only reaches your own…"). No private line into A's Voyager opens.
4. Account B: type `wren, …` — the summon is addressed (leading-name).
5. Either account: a mid-sentence "wren" does nothing.
