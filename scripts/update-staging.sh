#!/bin/bash
# Backward-compatible wrapper — prefer: ./scripts/update-prod.sh -dest stage
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/update-prod.sh" -dest stage "$@"
