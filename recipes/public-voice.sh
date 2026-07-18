#!/usr/bin/env bash
# Proving recipe — the public-voice proof of concept (cut ④). Drives the fan-out
# plan + the owner-anchored attribution boundary (§6.5) through the REAL
# stream-context mapper + the loop guard. Deterministic, no DB, no browser — the
# human-ritual two-account browser bench is the primary Test-gate recipe.
# Emits PUBLIC_VOICE_POC_GREEN.
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run lib/messaging/public-reply.test.ts --reporter=dot
echo "PUBLIC_VOICE_POC_GREEN"
