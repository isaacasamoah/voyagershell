#!/usr/bin/env bash
# Proof of concept: the owner-only execution gate, private persistence, and the
# explicit content-only promotion of a private reply into a human room message.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run \
  lib/messaging/address.test.ts \
  lib/messaging/two-account-bench.test.ts \
  lib/messaging/share.test.ts \
  lib/harness/room-turn.test.ts \
  lib/harness/run-turn.test.ts \
  lib/retrieval/tools.background.test.ts \
  --reporter=dot
echo "PRIVATE_VOYAGER_TRUST_GREEN"
