#!/usr/bin/env bash
# Rotate PostgreSQL password on a running Docker Compose stack (existing volume safe).
#
# The Postgres image only applies POSTGRES_PASSWORD on first init; for existing data
# you must ALTER USER inside the running database, then update .env and restart backend.
#
# Usage (on server in repo root, with backup/snapshot taken):
#   ./scripts/rotate-postgres-password.sh
#   ./scripts/rotate-postgres-password.sh --app-user daagbok   # optional: dedicated app role
#
# Writes the new credentials once to .postgres-credentials.<timestamp> (mode 600).
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
DB_CONTAINER="${DB_CONTAINER:-daagbox-prod-db}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-daagbox-prod-backend}"
CREATE_APP_USER=""
APP_USER_NAME="daagbok"

while [ $# -gt 0 ]; do
  case "$1" in
    --app-user)
      CREATE_APP_USER=1
      APP_USER_NAME="${2:-daagbok}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-daagbox}"
OLD_PASSWORD="${POSTGRES_PASSWORD:-}"

if [ -z "$OLD_PASSWORD" ]; then
  echo "Error: POSTGRES_PASSWORD not set in $ENV_FILE" >&2
  exit 1
fi

NEW_PASSWORD="$(openssl rand -hex 24)"
NEW_APP_PASSWORD=""
if [ -n "$CREATE_APP_USER" ]; then
  NEW_APP_PASSWORD="$(openssl rand -hex 24)"
fi

BACKUP_ENV="${ENV_FILE}.bak.pg-rotate.$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$BACKUP_ENV"
echo "Backed up $ENV_FILE → $BACKUP_ENV"

echo "Rotating password for PostgreSQL role: $POSTGRES_USER (database: $POSTGRES_DB)"

# Escape single quotes for SQL string literals
sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}
NEW_PW_SQL="$(sql_escape "$NEW_PASSWORD")"

export PGPASSWORD="$OLD_PASSWORD"
if ! docker exec -e PGPASSWORD="$OLD_PASSWORD" "$DB_CONTAINER" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -c "ALTER USER \"${POSTGRES_USER}\" WITH PASSWORD '${NEW_PW_SQL}';" >/dev/null; then
  echo "Error: ALTER USER failed. Is POSTGRES_PASSWORD in .env still correct?" >&2
  exit 1
fi
unset PGPASSWORD

TARGET_USER="$POSTGRES_USER"
TARGET_PASSWORD="$NEW_PASSWORD"

if [ -n "$CREATE_APP_USER" ]; then
  APP_PW_SQL="$(sql_escape "$NEW_APP_PASSWORD")"
  export PGPASSWORD="$NEW_PASSWORD"
  docker exec -e PGPASSWORD="$NEW_PASSWORD" "$DB_CONTAINER" psql -U postgres -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER_NAME}') THEN
    CREATE ROLE ${APP_USER_NAME} LOGIN PASSWORD '${APP_PW_SQL}';
  ELSE
    ALTER ROLE ${APP_USER_NAME} WITH LOGIN PASSWORD '${APP_PW_SQL}';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${APP_USER_NAME};
GRANT USAGE, CREATE ON SCHEMA public TO ${APP_USER_NAME};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${APP_USER_NAME};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER_NAME};
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO ${APP_USER_NAME};
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO ${APP_USER_NAME};
SQL
  unset PGPASSWORD
  TARGET_USER="$APP_USER_NAME"
  TARGET_PASSWORD="$NEW_APP_PASSWORD"
  echo "Created/updated application role: $APP_USER_NAME (postgres superuser password also rotated)"
fi

# Update .env without exposing values in process list longer than necessary
python3 - "$ENV_FILE" "$TARGET_USER" "$TARGET_PASSWORD" "$NEW_PASSWORD" "$CREATE_APP_USER" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
target_user = sys.argv[2]
target_password = sys.argv[3]
postgres_password = sys.argv[4]
use_app_user = sys.argv[5] == "1"

text = path.read_text(encoding="utf-8")

def set_var(name: str, value: str, content: str) -> str:
    pattern = rf"^{re.escape(name)}=.*$"
    line = f"{name}={value}"
    if re.search(pattern, content, flags=re.M):
        return re.sub(pattern, line, content, count=1, flags=re.M)
    return content.rstrip() + "\n" + line + "\n"

text = set_var("POSTGRES_USER", target_user, text)
text = set_var("POSTGRES_PASSWORD", target_password, text)
text = set_var("POSTGRES_DB", "daagbox", text) if "POSTGRES_DB=" not in text else text
if use_app_user:
    text = set_var("POSTGRES_ADMIN_PASSWORD", postgres_password, text)

path.write_text(text, encoding="utf-8")
PY

CREDS_FILE=".postgres-credentials.$(date +%Y%m%d-%H%M%S)"
umask 077
{
  echo "# Generated $(date -Iseconds) — store in password manager, then delete this file."
  echo "POSTGRES_USER=$TARGET_USER"
  echo "POSTGRES_PASSWORD=$TARGET_PASSWORD"
  echo "POSTGRES_DB=$POSTGRES_DB"
  if [ -n "$CREATE_APP_USER" ]; then
    echo "POSTGRES_ADMIN_USER=postgres"
    echo "POSTGRES_ADMIN_PASSWORD=$NEW_PASSWORD"
  fi
} > "$CREDS_FILE"
chmod 600 "$CREDS_FILE"
echo "Credentials written to $CREDS_FILE (chmod 600)"

echo "Restarting backend to pick up DATABASE_URL..."
docker compose -f "$COMPOSE_FILE" up -d backend

echo "Waiting for backend health..."
for _ in $(seq 1 45); do
  status="$(docker inspect --format='{{.State.Health.Status}}' "$BACKEND_CONTAINER" 2>/dev/null || echo missing)"
  if [ "$status" = healthy ]; then
    break
  fi
  sleep 1
done

export PGPASSWORD="$TARGET_PASSWORD"
docker exec -e PGPASSWORD="$TARGET_PASSWORD" "$DB_CONTAINER" \
  psql -U "$TARGET_USER" -d "$POSTGRES_DB" -tAc 'SELECT count(*) FROM "User";' >/dev/null
unset PGPASSWORD

if curl -sf http://127.0.0.1/api/health | grep -q '"status":"ok"'; then
  echo "OK: /api/health and DB connection verified."
else
  echo "Warning: health check failed — see: docker compose logs backend" >&2
  exit 1
fi

echo "Done. Remove $CREDS_FILE after saving credentials securely."
