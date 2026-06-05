#!/usr/bin/env bash
# Create a local backup of PostgreSQL, .env, docker-compose and app (git archive).
#
# Run on the server in repo root (/opt/kapteins-daagbok on production).
#
# Usage:
#   ./scripts/backup.sh
#   ./scripts/backup.sh -dest stage              # Staging-Container (daagbox-staging-db)
#   ./scripts/backup.sh --reason cron
#   ./scripts/backup.sh --reason pre-deploy --tag v0.1.1.20
#   ./scripts/backup.sh --dry-run
#
# Environment overrides:
#   BACKUP_DIR, COMPOSE_FILE, DB_CONTAINER, RETENTION, ENV_FILE
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/kapteins-daagbok}"
ENV_FILE="${ENV_FILE:-.env}"
RETENTION="${RETENTION:-5}"
DEST="prod"
REASON="manual"
EXPLICIT_TAG=""
DRY_RUN=0
COMPOSE_FILE=""
DB_CONTAINER=""

apply_dest_config() {
  local dest="$1"
  local force="${2:-0}"
  if [[ "$dest" == "stage" ]]; then
    if [[ "$force" == "1" || -z "${COMPOSE_FILE}" ]]; then
      COMPOSE_FILE="docker-compose.staging.yml"
    fi
    if [[ "$force" == "1" || -z "${DB_CONTAINER}" ]]; then
      DB_CONTAINER="daagbox-staging-db"
    fi
  else
    if [[ "$force" == "1" || -z "${COMPOSE_FILE}" ]]; then
      COMPOSE_FILE="docker-compose.yml"
    fi
    if [[ "$force" == "1" || -z "${DB_CONTAINER}" ]]; then
      DB_CONTAINER="daagbox-prod-db"
    fi
  fi
}

usage() {
  sed -n '2,14p' "$0"
  echo ""
  echo "Options:"
  echo "  -dest prod|stage                  Target environment (default: prod)"
  echo "  --reason cron|pre-deploy|manual   Backup trigger (default: manual)"
  echo "  --tag TAG                         Git tag label (e.g. v0.1.1.20 for pre-deploy)"
  echo "  --dry-run                         Show actions without writing backup"
  echo "  -h, --help                        Show this help"
}

while [ $# -gt 0 ]; do
  case "$1" in
    -dest)
      DEST="${2:?-dest requires an argument}"
      shift 2
      ;;
    -dest=*)
      DEST="${1#*=}"
      shift
      ;;
    --reason)
      REASON="${2:?--reason requires an argument}"
      shift 2
      ;;
    --tag)
      EXPLICIT_TAG="${2:?--tag requires an argument}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
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

case "$DEST" in
  prod|stage) ;;
  *)
    echo "Error: invalid -dest '$DEST' (use prod or stage)" >&2
    exit 1
    ;;
esac

apply_dest_config "$DEST"

case "$REASON" in
  cron|pre-deploy|manual) ;;
  *)
    echo "Error: invalid --reason '$REASON' (use cron, pre-deploy, or manual)" >&2
    exit 1
    ;;
esac

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Error: $COMPOSE_FILE not found" >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
GIT_TAG="$EXPLICIT_TAG"
if [ -z "$GIT_TAG" ]; then
  GIT_TAG="$(git describe --tags --exact-match HEAD 2>/dev/null || true)"
fi
if [ -z "$GIT_TAG" ] && [ -f VERSION ]; then
  GIT_TAG="v$(tr -d '[:space:]' < VERSION)"
fi
if [ -z "$GIT_TAG" ]; then
  GIT_TAG="unknown"
fi

APP_VERSION="$(tr -d '[:space:]' < VERSION 2>/dev/null || echo unknown)"
TAG_SLUG="${GIT_TAG}"
if [ "$REASON" = "pre-deploy" ]; then
  TAG_SLUG="${GIT_TAG}-predeploy"
fi
TAG_SLUG="${TAG_SLUG//\//-}"

ARCHIVE_NAME="kapteins-daagbok_${TIMESTAMP}_${TAG_SLUG}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

echo "Backup: reason=$REASON tag=$GIT_TAG sha=${GIT_SHA:0:8} → $ARCHIVE_PATH"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] Would dump database from $DB_CONTAINER"
  echo "[dry-run] Would copy $ENV_FILE and $COMPOSE_FILE"
  echo "[dry-run] Would create git archive"
  echo "[dry-run] Would write manifest and pack to $ARCHIVE_PATH"
  echo "[dry-run] Would apply retention (keep $RETENTION)"
  exit 0
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found (run from repo root)" >&2
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
  if [[ "$DEST" == "prod" ]] && docker inspect daagbox-staging-db >/dev/null 2>&1; then
    echo "Note: $DB_CONTAINER not found — falling back to staging (daagbox-staging-db). Use -dest stage explicitly."
    apply_dest_config stage 1
    DEST="stage"
  else
    echo "Error: DB container '$DB_CONTAINER' not found" >&2
    exit 1
  fi
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER")" != "true" ]; then
  echo "Error: DB container '$DB_CONTAINER' is not running" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

WORK_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "Dumping PostgreSQL ($POSTGRES_DB)..."
export PGPASSWORD="$POSTGRES_PASSWORD"
if ! docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl \
  | gzip > "$WORK_DIR/database.sql.gz"; then
  echo "Error: pg_dump failed" >&2
  exit 1
fi
unset PGPASSWORD

cp "$ENV_FILE" "$WORK_DIR/.env"
chmod 600 "$WORK_DIR/.env"
cp "$COMPOSE_FILE" "$WORK_DIR/docker-compose.yml"

echo "Creating app snapshot (git archive)..."
if git archive --format=tar HEAD | gzip > "$WORK_DIR/app.tar.gz"; then
  :
else
  echo "Warning: git archive failed — backup continues without app.tar.gz" >&2
  rm -f "$WORK_DIR/app.tar.gz"
fi

python3 - "$WORK_DIR/manifest.json" <<PY
import json
import socket
import sys
from datetime import datetime, timezone

manifest = {
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "local_timestamp": "${TIMESTAMP}",
    "destination": "${DEST}",
    "reason": "${REASON}",
    "git_tag": "${GIT_TAG}",
    "git_sha": "${GIT_SHA}",
    "app_version": "${APP_VERSION}",
    "compose_file": "${COMPOSE_FILE}",
    "db_container": "${DB_CONTAINER}",
    "postgres_db": "${POSTGRES_DB}",
    "hostname": socket.gethostname(),
    "archive_name": "${ARCHIVE_NAME}",
}
with open(sys.argv[1], "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
PY

echo "Packing backup archive..."
tar -czf "$ARCHIVE_PATH" -C "$WORK_DIR" \
  manifest.json database.sql.gz .env docker-compose.yml \
  $( [ -f "$WORK_DIR/app.tar.gz" ] && echo app.tar.gz )
chmod 600 "$ARCHIVE_PATH"

echo "Applying retention (keep last $RETENTION backups)..."
mapfile -t ALL_BACKUPS < <(ls -1t "$BACKUP_DIR"/kapteins-daagbok_*.tar.gz 2>/dev/null || true)
if [ "${#ALL_BACKUPS[@]}" -gt "$RETENTION" ]; then
  for ((i = RETENTION; i < ${#ALL_BACKUPS[@]}; i++)); do
    echo "Removing old backup: ${ALL_BACKUPS[$i]}"
    rm -f "${ALL_BACKUPS[$i]}"
  done
fi

echo "Backup complete: $ARCHIVE_PATH"
echo "$ARCHIVE_PATH"
