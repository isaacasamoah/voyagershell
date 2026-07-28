#!/usr/bin/env bash
# Cumulative local proof: exact disposable K3 PostgreSQL plus every unit and
# contract test. Emits FULL_SUITE_GREEN only after both boundaries pass.
set -euo pipefail
cd "$(dirname "$0")/.."
./recipes/cartographer-k3-local-proof.sh
./recipes/cartographer-k4a-local-proof.sh
npx vitest run --reporter=dot
echo "FULL_SUITE_GREEN"
