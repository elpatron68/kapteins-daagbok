#!/usr/bin/env bash
# Patch production .env for Sprint 1 docker-compose (POSTGRES_* + TRUST_PROXY).
# Safe: does not overwrite existing keys. Run on the server in /opt/kapteins-daagbok.
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

backup="${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$backup"
echo "Backup: $backup"

ensure_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    echo "  keep  ${key} (already set)"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
    echo "  add   ${key}"
  fi
}

echo "Patching $ENV_FILE for Sprint 1..."
# Match running container (docker exec daagbox-prod-db: USER=postgres DB=daagbox)
ensure_var POSTGRES_USER "postgres"
ensure_var POSTGRES_DB "daagbox"
# Default from legacy docker-compose.yml; change only if you use a different DB password
ensure_var POSTGRES_PASSWORD "postgres"
# NPM on 172.16.10.10 → app on this host
ensure_var TRUST_PROXY "172.16.10.10"

echo "Done. Verify with: docker exec daagbox-prod-db psql -U postgres -d daagbox -c 'SELECT 1'"
