#!/usr/bin/env bash
# Cumulative local proof: exact disposable K3/K4/K5a PostgreSQL plus every unit
# and contract test. Emits FULL_SUITE_GREEN only after all boundaries pass.
set -euo pipefail
cd "$(dirname "$0")/.."
./recipes/cartographer-k3-local-proof.sh
./recipes/cartographer-k4a-local-proof.sh
./recipes/cartographer-k4b-local-proof.sh
./recipes/cartographer-k4c-local-proof.sh
./recipes/cartographer-k5a-c3-local-proof.sh
npx vitest run --reporter=dot
echo "FULL_SUITE_GREEN"
