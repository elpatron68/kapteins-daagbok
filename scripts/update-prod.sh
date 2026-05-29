#!/bin/bash

set -euo pipefail

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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$REPO_ROOT/VERSION"
DEFAULT_VERSION="0.1.0.0"

echo "=================================================="
echo "    Kapteins Daagbok Prod Environment Update     "
echo "=================================================="
echo "Target: ${REMOTE_TARGET}:${REMOTE_DIR}"
echo "=================================================="

cd "$REPO_ROOT"

read_current_version() {
  if [ -f "$VERSION_FILE" ]; then
    tr -d '[:space:]' < "$VERSION_FILE"
    return
  fi

  local latest_tag
  latest_tag="$(git tag -l 'v*' --sort=-v:refname | head -n 1 || true)"
  if [ -n "$latest_tag" ]; then
    echo "${latest_tag#v}"
    return
  fi

  echo "$DEFAULT_VERSION"
}

bump_patch_version() {
  local version="$1"
  local major minor patch build

  IFS='.' read -r major minor patch build <<< "$version"
  major="${major:-0}"
  minor="${minor:-1}"
  patch="${patch:-0}"
  build="${build:-0}"

  build=$((10#$build + 1))
  echo "${major}.${minor}.${patch}.${build}"
}

ensure_clean_git_tree() {
  if git diff-index --quiet HEAD -- && [ -z "$(git status --porcelain)" ]; then
    return 0
  fi

  echo ""
  echo "Uncommitted local changes detected:"
  git status --short
  echo ""
  read -r -p "Commit all changes now before release? [y/N] " answer

  if [[ ! "$answer" =~ ^[yY]$ ]]; then
    echo "Aborting: working tree is not clean."
    exit 1
  fi

  read -r -p "Commit message: " commit_message
  if [ -z "$commit_message" ]; then
    echo "Aborting: commit message is required."
    exit 1
  fi

  git add -A
  git commit -m "$commit_message"
}

prepare_release() {
  local current_version release_version next_version tag_name

  ensure_clean_git_tree

  current_version="$(read_current_version)"
  release_version="$current_version"
  next_version="$(bump_patch_version "$current_version")"
  tag_name="v${release_version}"

  if git rev-parse "$tag_name" >/dev/null 2>&1; then
    echo "Error: Git tag '$tag_name' already exists."
    exit 1
  fi

  echo "$next_version" > "$VERSION_FILE"
  git add "$VERSION_FILE"
  git commit -m "chore: release ${tag_name}"
  git tag -a "$tag_name" -m "Release ${tag_name}"

  echo ""
  echo "Prepared release ${tag_name}"
  echo "  Released:  ${tag_name}"
  echo "  Next prep: v${next_version}"
  echo ""

  read -r -p "Push commit and tag to origin? [Y/n] " push_answer
  if [[ ! "$push_answer" =~ ^[nN]$ ]]; then
    current_branch="$(git branch --show-current)"
    git push origin "$current_branch"
    git push origin "$tag_name"
    echo "Pushed ${current_branch} and ${tag_name} to origin."
  else
    echo "Skipped push. Remote host must receive this commit/tag manually."
  fi

  export APP_VERSION="$release_version"
}

prepare_release

echo "=================================================="
echo "Deploying ${APP_VERSION} to ${REMOTE_TARGET}:${REMOTE_DIR}"
echo "=================================================="

# Run the whole update procedure remotely over SSH.
ssh -o ConnectTimeout=10 "$REMOTE_TARGET" 'bash -s' -- \
  "$REMOTE_DIR" "$COMPOSE_FILE" "$BACKEND_CONTAINER" "$MAX_WAIT" "$REMOTE_HOST" "$APP_VERSION" <<'REMOTE_SCRIPT'
set -uo pipefail

REMOTE_DIR="$1"
COMPOSE_FILE="$2"
BACKEND_CONTAINER="$3"
MAX_WAIT="$4"
REMOTE_HOST="$5"
APP_VERSION="$6"

cd "$REMOTE_DIR" || { echo "Error: Remote directory '$REMOTE_DIR' not found."; exit 1; }

echo "Pulling latest changes from Git..."
git pull --tags
if [ $? -ne 0 ]; then
  echo "Error: Git pull failed."
  exit 1
fi

REMOTE_VERSION="$(tr -d '[:space:]' < VERSION)"
if [ "$REMOTE_VERSION" != "$APP_VERSION" ]; then
  echo "Note: Remote VERSION file already points to next release (v${REMOTE_VERSION})."
  echo "      Building deployed release v${APP_VERSION}."
fi

export APP_VERSION="$APP_VERSION"

echo "Rebuilding Docker images without cache (APP_VERSION=${APP_VERSION})..."
docker compose -f "$COMPOSE_FILE" build --no-cache
if [ $? -ne 0 ]; then
  echo "Error: Docker compose build failed."
  exit 1
fi

echo "Starting updated container stack..."
docker compose -f "$COMPOSE_FILE" up -d
if [ $? -ne 0 ]; then
  echo "Error: Failed to spin up docker-compose stack."
  exit 1
fi

echo "Cleaning up old/unused Docker resources..."
docker system prune -f
if [ $? -ne 0 ]; then
  echo "Warning: Docker system prune failed to run completely."
fi

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
  printf "."
done
echo ""

echo "=================================================="
echo "Container Statuses:"
docker compose -f "$COMPOSE_FILE" ps
echo "=================================================="

if [ "$IS_READY" = true ]; then
  echo "SUCCESS: Production environment updated and healthy!"
  echo " -> Version:               v${APP_VERSION}"
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

REMOTE_EXIT=$?
echo "=================================================="
if [ $REMOTE_EXIT -eq 0 ]; then
  echo "Remote update completed successfully on ${REMOTE_TARGET} (v${APP_VERSION})."
elif [ $REMOTE_EXIT -eq 3 ]; then
  echo "Remote update finished, but the backend was not healthy in time on ${REMOTE_TARGET}."
else
  echo "Remote update FAILED on ${REMOTE_TARGET} (exit code: ${REMOTE_EXIT})."
fi
echo "=================================================="
exit $REMOTE_EXIT
