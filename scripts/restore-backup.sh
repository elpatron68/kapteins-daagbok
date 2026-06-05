#!/usr/bin/env bash
# Restore server backup created by scripts/backup.sh
#
# Usage:
#   ./scripts/restore-backup.sh --list
#   ./scripts/restore-backup.sh --restore /var/backups/kapteins-daagbok/kapteins-daagbok_....tar.gz
#   ./scripts/restore-backup.sh --restore PATH --db-only
#   ./scripts/restore-backup.sh --restore PATH --env-only
#   ./scripts/restore-backup.sh --restore PATH --full --yes
#
# Environment overrides:
#   BACKUP_DIR, COMPOSE_FILE, DB_CONTAINER, BACKEND_CONTAINER, ENV_FILE
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/kapteins-daagbok}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_CONTAINER="${DB_CONTAINER:-daagbox-prod-db}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-daagbox-prod-backend}"
ENV_FILE="${ENV_FILE:-.env}"
MAX_WAIT=90

MODE="full"
RESTORE_PATH=""
LIST=0
ASSUME_YES=0

usage() {
  sed -n '2,10p' "$0"
  echo ""
  echo "Options:"
  echo "  --list                            List available backups"
  echo "  --restore PATH                    Backup archive to restore"
  echo "  --full                            Restore DB + .env (default)"
  echo "  --db-only                         Restore database only"
  echo "  --env-only                        Restore .env only"
  echo "  --yes                             Skip confirmation prompts"
  echo "  -h, --help                        Show this help"
}

confirm() {
  local prompt="$1"
  if [ "$ASSUME_YES" -eq 1 ]; then
    return 0
  fi
  read -r -p "$prompt [y/N] " answer
  [[ "$answer" =~ ^[yY]$ ]]
}

while [ $# -gt 0 ]; do
  case "$1" in
    --list)
      LIST=1
      shift
      ;;
    --restore)
      RESTORE_PATH="${2:?--restore requires a path}"
      shift 2
      ;;
    --full)
      MODE="full"
      shift
      ;;
    --db-only)
      MODE="db-only"
      shift
      ;;
    --env-only)
      MODE="env-only"
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

list_backups() {
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "No backup directory: $BACKUP_DIR"
    return 0
  fi

  local found=0
  while IFS= read -r archive; do
    found=1
    echo "=== $archive ==="
    tar -xOf "$archive" manifest.json 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "(no manifest)"
    echo ""
  done < <(ls -1t "$BACKUP_DIR"/kapteins-daagbok_*.tar.gz 2>/dev/null || true)

  if [ "$found" -eq 0 ]; then
    echo "No backups found in $BACKUP_DIR"
  fi
}

if [ "$LIST" -eq 1 ]; then
  list_backups
  exit 0
fi

if [ -z "$RESTORE_PATH" ]; then
  echo "Error: --restore PATH or --list required" >&2
  usage >&2
  exit 1
fi

if [ ! -f "$RESTORE_PATH" ]; then
  echo "Error: backup archive not found: $RESTORE_PATH" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "Extracting $RESTORE_PATH..."
tar -xzf "$RESTORE_PATH" -C "$WORK_DIR"

if [ ! -f "$WORK_DIR/manifest.json" ]; then
  echo "Error: manifest.json missing in backup archive" >&2
  exit 1
fi

MANIFEST="$WORK_DIR/manifest.json"
echo "Backup manifest:"
python3 -m json.tool "$MANIFEST"
echo ""

GIT_TAG="$(python3 -c "import json; print(json.load(open('$MANIFEST'))['git_tag'])")"
GIT_SHA="$(python3 -c "import json; print(json.load(open('$MANIFEST'))['git_sha'])")"
BACKUP_TS="$(python3 -c "import json; print(json.load(open('$MANIFEST'))['local_timestamp'])")"

if ! confirm "Restore backup from $BACKUP_TS (tag: $GIT_TAG)? Mode: $MODE"; then
  echo "Aborted."
  exit 1
fi

restore_env() {
  if [ ! -f "$WORK_DIR/.env" ]; then
    echo "Error: .env missing in backup archive" >&2
    exit 1
  fi

  if [ -f "$ENV_FILE" ]; then
    BAK="${ENV_FILE}.bak-restore.$(date +%Y%m%d-%H%M%S)"
    cp "$ENV_FILE" "$BAK"
    echo "Current $ENV_FILE saved to $BAK"
  fi

  cp "$WORK_DIR/.env" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Restored $ENV_FILE"
}

restore_db() {
  if [ ! -f "$WORK_DIR/database.sql.gz" ]; then
    echo "Error: database.sql.gz missing in backup archive" >&2
    exit 1
  fi

  if [ ! -f "$ENV_FILE" ]; then
    echo "Error: $ENV_FILE required for database restore" >&2
    exit 1
  fi

  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a

  POSTGRES_USER="${POSTGRES_USER:-postgres}"
  POSTGRES_DB="${POSTGRES_DB:-daagbox}"

  if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    echo "Error: POSTGRES_PASSWORD not set in $ENV_FILE" >&2
    exit 1
  fi

  if ! docker inspect "$DB_CONTAINER" >/dev/null 2>&1; then
    echo "Error: DB container '$DB_CONTAINER' not found" >&2
    exit 1
  fi

  echo "Stopping backend before database restore..."
  docker compose -f "$COMPOSE_FILE" stop backend || true

  echo "Resetting public schema..."
  export PGPASSWORD="$POSTGRES_PASSWORD"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<SQL
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO "${POSTGRES_USER}";
GRANT ALL ON SCHEMA public TO public;
SQL

  echo "Importing database dump..."
  gunzip -c "$WORK_DIR/database.sql.gz" | docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
  unset PGPASSWORD

  echo "Database restore complete."
}

wait_for_healthy() {
  echo "Starting stack and waiting for health..."
  docker compose -f "$COMPOSE_FILE" up -d

  local counter=0
  while [ "$counter" -lt "$MAX_WAIT" ]; do
    local status
    status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$BACKEND_CONTAINER" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      echo "Backend is healthy."
      return 0
    fi
    if curl -sf "http://127.0.0.1/api/health" | grep -q '"status":"ok"'; then
      echo "API health check OK."
      return 0
    fi
    sleep 1
    counter=$((counter + 1))
    printf "."
  done
  echo ""
  echo "Warning: backend did not become healthy in time." >&2
  return 1
}

case "$MODE" in
  env-only)
    restore_env
    ;;
  db-only)
    restore_db
    wait_for_healthy || exit 1
    ;;
  full)
    restore_env
    restore_db
    wait_for_healthy || exit 1
    if [ -f "$WORK_DIR/app.tar.gz" ] && [ "$GIT_TAG" != "unknown" ]; then
      if confirm "Checkout app code at tag $GIT_TAG? (git fetch + checkout)"; then
        git fetch --tags origin
        git checkout "$GIT_TAG"
        echo "Checked out $GIT_TAG"
      fi
    fi
    ;;
  *)
    echo "Error: unknown mode $MODE" >&2
    exit 1
    ;;
esac

echo "Restore finished (mode: $MODE, tag: $GIT_TAG, sha: ${GIT_SHA:0:8})."
