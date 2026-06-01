#!/usr/bin/env bash
# Local quality gates before deploying to kapteins-daagbok.eu (no external CI).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=================================================="
echo "  Kapteins Daagbok — pre-deploy checks"
echo "=================================================="

run() {
  echo ""
  echo "==> $*"
  "$@"
}

run npm run validate:i18n

pushd client >/dev/null
if [ ! -d node_modules ]; then
  run npm ci
fi
# Lint: run separately with `npm run lint` (client ESLint; cleanup tracked separately)
run npm run test
run npm run build
popd >/dev/null

pushd server >/dev/null
if [ ! -d node_modules ]; then
  run npm ci
fi
run npm run test
run npm run build
popd >/dev/null

echo ""
echo "=================================================="
echo "  All pre-deploy checks passed."
echo "=================================================="
