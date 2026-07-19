#!/usr/bin/env bash
# Proving recipe — the two-account human-equivalent bench. Two accounts share a
# room, one names their Voyager "wren"; asserts @wren aside stays private to its
# owner FROM THE OTHER ACCOUNT, leading-name summons, @other redirects, and a
# mid-sentence mention does nothing — via the real data-layer assembly feeding
# the real resolver. Emits TWO_ACCOUNT_BENCH_OK.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run lib/messaging/two-account-bench.test.ts --reporter=dot
echo "TWO_ACCOUNT_BENCH_OK"
