#!/usr/bin/env bash
# Proving recipe — the deterministic addressing grammar (the riskiest claim C1).
# @own = private · every non-own @ = HELD · every leading name = ordinary room
# text · client audience and server address resolution share the same function.
# Emits ADDRESS_GRAMMAR_GREEN.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run lib/messaging/address.test.ts lib/harness/room-turn.test.ts --reporter=dot
echo "ADDRESS_GRAMMAR_GREEN"
