#!/usr/bin/env bash
# Proving recipe — strict typecheck across the whole worktree. Emits TYPECHECK_OK.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run type-check
echo "TYPECHECK_OK"
