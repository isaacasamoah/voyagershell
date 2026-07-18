#!/usr/bin/env bash
# Proving recipe — the deterministic addressing grammar (the riskiest claim C1).
# @own = aside · @other = redirect (NEVER aside) · leading-name = summon ·
# mid-sentence = neither · @voyager alias parity. Emits ADDRESS_GRAMMAR_GREEN.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run lib/messaging/address.test.ts lib/harness/room-turn.test.ts --reporter=dot
echo "ADDRESS_GRAMMAR_GREEN"
