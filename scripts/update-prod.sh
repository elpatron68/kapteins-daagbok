#!/bin/bash

# Remote deployment configuration
# Override any of these via environment variables if needed, e.g.:
#   REMOTE_HOST=192.168.1.10 ./scripts/update-prod.sh
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:-10.0.0.25}"
REMOTE_DIR="${REMOTE_DIR:-/opt/kapteins-daagbok}"
REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

# Configuration
COMPOSE_FILE="docker-compose.yml"
BACKEND_CONTAINER="daagbox-prod-backend"
MAX_WAIT=35

echo "=================================================="
# Translates to: Kapteins Daagbox Production Environment Update
echo "    Kapteins Daagbox Prod Environment Update     "
echo "=================================================="
echo "Target: ${REMOTE_TARGET}:${REMOTE_DIR}"
echo "=================================================="

# Run the whole update procedure remotely over SSH.
# The remote arguments are forwarded positionally so the heredoc can stay
# single-quoted (no local variable expansion / escaping surprises).
ssh -o ConnectTimeout=10 "$REMOTE_TARGET" 'bash -s' -- \
  "$REMOTE_DIR" "$COMPOSE_FILE" "$BACKEND_CONTAINER" "$MAX_WAIT" "$REMOTE_HOST" <<'REMOTE_SCRIPT'
set -uo pipefail

REMOTE_DIR="$1"
COMPOSE_FILE="$2"
BACKEND_CONTAINER="$3"
MAX_WAIT="$4"
REMOTE_HOST="$5"

# Change to the deployment directory on the remote host
cd "$REMOTE_DIR" || { echo "Error: Remote directory '$REMOTE_DIR' not found."; exit 1; }

# 1. Pull latest code changes
echo "Pulling latest changes from Git..."
git pull
if [ $? -ne 0 ]; then
  echo "Error: Git pull failed."
  exit 1
fi

# 2. Build docker images without cache
echo "Rebuilding Docker images without cache..."
docker compose -f "$COMPOSE_FILE" build --no-cache
if [ $? -ne 0 ]; then
  echo "Error: Docker compose build failed."
  exit 1
fi

# 3. Spin up the containers
echo "Starting updated container stack..."
docker compose -f "$COMPOSE_FILE" up -d
if [ $? -ne 0 ]; then
  echo "Error: Failed to spin up docker-compose stack."
  exit 1
fi

# 4. Clean up old/stopped Docker assets (containers, networks, dangling images, cache)
echo "Cleaning up old/unused Docker resources..."
docker system prune -f
if [ $? -ne 0 ]; then
  echo "Warning: Docker system prune failed to run completely."
fi

# 5. Wait for services to become healthy (Prisma migrations & DB check)
echo "Waiting for services to become healthy..."
COUNTER=0
IS_READY=false

while [ $COUNTER -lt $MAX_WAIT ]; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$BACKEND_CONTAINER" 2>/dev/null)

  if [ "$STATUS" = "healthy" ]; then
    IS_READY=true
    break
  fi

  sleep 1
  COUNTER=$((COUNTER + 1))
  # Show simple progress dots
  printf "."
done
echo ""

echo "=================================================="
echo "Container Statuses:"
docker compose -f "$COMPOSE_FILE" ps
echo "=================================================="

if [ "$IS_READY" = true ]; then
  echo "SUCCESS: Production environment updated and healthy!"
  echo " -> App Frontend (Nginx):  http://${REMOTE_HOST}"
  echo " -> Backend API Health:    http://${REMOTE_HOST}/api/health"
  echo "=================================================="
else
  echo "WARNING: Backend did not transition to healthy in time."
  echo "Check backend container logs for details:"
  echo " -> docker compose logs backend"
  echo "=================================================="
  exit 3
fi
REMOTE_SCRIPT

# Capture and report the remote exit status locally
REMOTE_EXIT=$?
echo "=================================================="
if [ $REMOTE_EXIT -eq 0 ]; then
  echo "Remote update completed successfully on ${REMOTE_TARGET}."
elif [ $REMOTE_EXIT -eq 3 ]; then
  echo "Remote update finished, but the backend was not healthy in time on ${REMOTE_TARGET}."
else
  echo "Remote update FAILED on ${REMOTE_TARGET} (exit code: ${REMOTE_EXIT})."
fi
echo "=================================================="
exit $REMOTE_EXIT
