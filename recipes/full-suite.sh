#!/usr/bin/env bash
# Proving recipe — the full unit suite (handles derivation/isOwn, grammar, gate
# wiring, prompt identity, badge, + all pre-existing tests). Emits FULL_SUITE_GREEN.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run --reporter=dot
echo "FULL_SUITE_GREEN"
