#!/usr/bin/env bash
# ── ORU-449 PROOF OF CONCEPT — the aside-marking data path, proven green ────────
# The riskiest architectural claim of this job: a reply to an `@handle` aside was
# persisted as an UNMARKED `conversation` event — indistinguishable from a solo
# reply — so half of every whisper (the reply) could not be given the "private to
# you" treatment. The POC closes that gap: the aside reply now carries
# source:'aside', and the feed projects `isAside` onto BOTH the whisper and its
# reply, so render can mark them private. This recipe is the POC's OWN run
# instruction — it runs the deterministic backbone (typecheck + the two data-path
# test files) and emits POC_ASIDE_PRIVACY_OK. Self-locating: safe to run cold from
# anywhere.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── typecheck (the whole worktree compiles with the isAside contract) ──"
npm run type-check

echo "── the aside-marking data path (public-reply + feed projection) ──"
npx vitest run \
  lib/messaging/public-reply.test.ts \
  lib/messaging/feed.test.ts \
  lib/messaging/feed-types.test.ts \
  --reporter=dot

echo "POC_ASIDE_PRIVACY_OK"
