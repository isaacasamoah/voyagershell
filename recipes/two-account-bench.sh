#!/usr/bin/env bash
# Proving recipe — the two-account human-equivalent bench. Two accounts share a
# room, one names their Voyager "wren"; asserts @wren aside stays private to its
# owner FROM THE OTHER ACCOUNT, @other is held, and a leading-name reference is
# ordinary human room text. Emits TWO_ACCOUNT_BENCH_OK.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run lib/messaging/two-account-bench.test.ts --reporter=dot
echo "TWO_ACCOUNT_BENCH_OK"
