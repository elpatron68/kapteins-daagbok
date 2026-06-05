#!/bin/bash
# Backward-compatible wrapper — prefer: ./scripts/update-prod.sh -dest stage
set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    -dest|-dest=*)
      echo "Error: update-staging.sh always deploys to staging." >&2
      echo "       Use ./scripts/update-prod.sh -dest prod for production." >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/update-prod.sh" -dest stage "$@"
