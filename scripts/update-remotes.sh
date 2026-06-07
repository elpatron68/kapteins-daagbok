#!/bin/bash

set -euo pipefail

usage() {
  cat <<EOF
Usage: $(basename "$0") [-dest prod|stage]

Deploy Kapteins Daagbok to production or staging.

  -dest prod   Production (default): release tag, bump VERSION, deploy to 10.0.0.25
  -dest stage  Staging: no release tag, deploy branch to 10.0.0.27

Environment overrides (optional):
  REMOTE_HOST, REMOTE_USER, REMOTE_DIR, COMPOSE_FILE, BACKEND_CONTAINER
  DEPLOY_BRANCH (stage only, default: master)
  SKIP_PREDEPLOY_CHECK=1

Local repo must be clean and match origin before deploy (git fetch + compare HEAD).

Examples:
  $(basename "$0") -dest prod
  $(basename "$0") -dest stage
  DEPLOY_BRANCH=feature/foo $(basename "$0") -dest stage
EOF
}

DEST="prod"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -dest)
      if [[ $# -lt 2 ]]; then
        echo "Error: -dest requires an argument (prod or stage)." >&2
        usage
        exit 1
      fi
      DEST="$2"
      shift 2
      ;;
    -dest=*)
      DEST="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

case "$DEST" in
  prod|stage) ;;
  *)
    echo "Error: Invalid -dest '$DEST' (use prod or stage)." >&2
    usage
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$REPO_ROOT/VERSION"
DEFAULT_VERSION="0.1.0.0"
MAX_WAIT=90

REMOTE_USER="${REMOTE_USER:-root}"
GIT_REMOTE="${GIT_REMOTE:-github}"
GIT_REMOTE_URL="${GIT_REMOTE_URL:-https://github.com/elpatron68/kapteins-daagbok.git}"
# GIT_REMOTE="${GIT_REMOTE:-origin}"
# GIT_REMOTE_URL="${GIT_REMOTE_URL:-https://gitea.elpatron.me/elpatron/kapteins-daagbok.git}"


if [[ "$DEST" == "stage" ]]; then
  REMOTE_HOST="${REMOTE_HOST:-10.0.0.27}"
  REMOTE_DIR="${REMOTE_DIR:-/opt/kapteins-daagbok-staging}"
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
  BACKEND_CONTAINER="${BACKEND_CONTAINER:-daagbox-staging-backend}"
  APP_URL="${APP_URL:-https://staging.kapteins-daagbok.eu}"
  DEPLOY_BRANCH="${DEPLOY_BRANCH:-master}"
  ENV_LABEL="Staging"
else
  REMOTE_HOST="${REMOTE_HOST:-10.0.0.25}"
  REMOTE_DIR="${REMOTE_DIR:-/opt/kapteins-daagbok}"
  COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
  BACKEND_CONTAINER="${BACKEND_CONTAINER:-daagbox-prod-backend}"
  APP_URL="${APP_URL:-https://kapteins-daagbok.eu}"
  DEPLOY_BRANCH=""
  ENV_LABEL="Production"
fi

REMOTE_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

echo "=================================================="
echo "    Kapteins Daagbok ${ENV_LABEL} Update"
echo "=================================================="
echo "Destination: ${DEST}"
echo "Target:      ${REMOTE_TARGET}:${REMOTE_DIR}"
if [[ "$DEST" == "stage" ]]; then
  echo "Branch:      ${DEPLOY_BRANCH}"
fi
echo "URL:         ${APP_URL}"
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
  if [ -z "$(git status --porcelain)" ]; then
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

ensure_local_sync_with_origin() {
  local branch="$1"
  local local_sha origin_sha current_branch

  if [ -z "$branch" ]; then
    echo "Error: deploy branch is not set." >&2
    exit 1
  fi

  if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Working tree is not clean. Commit or stash changes before deploying." >&2
    git status --short
    exit 1
  fi

  current_branch="$(git branch --show-current)"
  if [ -z "$current_branch" ]; then
    echo "Error: Detached HEAD — checkout branch '$branch' before deploying." >&2
    exit 1
  fi

  if [ "$current_branch" != "$branch" ]; then
    echo "Error: On branch '$current_branch', expected '$branch'." >&2
    exit 1
  fi

  echo "Syncing with ${GIT_REMOTE}..."
  git fetch --tags "${GIT_REMOTE}"
  if [ $? -ne 0 ]; then
    echo "Error: git fetch ${GIT_REMOTE} failed." >&2
    exit 1
  fi

  if ! git rev-parse --verify "${GIT_REMOTE}/${branch}" >/dev/null 2>&1; then
    echo "Error: ${GIT_REMOTE}/${branch} does not exist." >&2
    exit 1
  fi

  local_sha="$(git rev-parse HEAD)"
  origin_sha="$(git rev-parse "${GIT_REMOTE}/${branch}")"

  if [ "$local_sha" = "$origin_sha" ]; then
    echo "Local branch '$branch' matches ${GIT_REMOTE}/${branch} ($(git rev-parse --short HEAD))."
    return 0
  fi

  echo "Error: Local '$branch' is not in sync with ${GIT_REMOTE}/${branch}." >&2
  echo "  local:  $(git rev-parse --short HEAD) $(git log -1 --format='%s' HEAD)" >&2
  echo "  ${GIT_REMOTE}: $(git rev-parse --short "${GIT_REMOTE}/${branch}") $(git log -1 --format='%s' "${GIT_REMOTE}/${branch}")" >&2

  if git merge-base --is-ancestor "$local_sha" "${GIT_REMOTE}/${branch}" 2>/dev/null; then
    echo "Hint: run 'git pull' to fast-forward." >&2
  elif git merge-base --is-ancestor "${GIT_REMOTE}/${branch}" "$local_sha" 2>/dev/null; then
    echo "Hint: run 'git push ${GIT_REMOTE} ${branch}' before deploying." >&2
  else
    echo "Hint: branches have diverged — reconcile manually before deploying." >&2
  fi
  exit 1
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

  read -r -p "Push commit and tag to ${GIT_REMOTE}? [Y/n] " push_answer
  if [[ ! "$push_answer" =~ ^[nN]$ ]]; then
    current_branch="$(git branch --show-current)"
    git push "${GIT_REMOTE}" "$current_branch"
    git push "${GIT_REMOTE}" "$tag_name"
    echo "Pushed ${current_branch} and ${tag_name} to ${GIT_REMOTE}."
  else
    echo "Skipped push. Remote host must receive this commit/tag manually."
  fi

  export APP_VERSION="$release_version"
}

if [[ "$DEST" == "prod" ]]; then
  prepare_release
  ensure_local_sync_with_origin "$(git branch --show-current)"
else
  ensure_local_sync_with_origin "$DEPLOY_BRANCH"
  APP_VERSION="$(read_current_version)"
fi

if [[ "${SKIP_PREDEPLOY_CHECK:-}" == "1" ]]; then
  echo "Skipping pre-deploy checks (SKIP_PREDEPLOY_CHECK=1)."
else
  echo "=================================================="
  echo "    Pre-deploy checks (local)"
  echo "=================================================="
  "$SCRIPT_DIR/predeploy-check.sh"
fi

echo "=================================================="
echo "Deploying v${APP_VERSION} to ${REMOTE_TARGET}:${REMOTE_DIR}"
echo "=================================================="

ssh -o ConnectTimeout=10 "$REMOTE_TARGET" 'bash -s' -- \
  "$REMOTE_DIR" "$COMPOSE_FILE" "$BACKEND_CONTAINER" "$MAX_WAIT" "$APP_URL" "$APP_VERSION" "$DEST" "$DEPLOY_BRANCH" "$GIT_REMOTE_URL" <<'REMOTE_SCRIPT'
set -uo pipefail

REMOTE_DIR="$1"
COMPOSE_FILE="$2"
BACKEND_CONTAINER="$3"
MAX_WAIT="$4"
APP_URL="$5"
APP_VERSION="$6"
DEST="$7"
DEPLOY_BRANCH="${8:-}"
GIT_REMOTE_URL="${9:-https://github.com/elpatron68/kapteins-daagbok.git}"

cd "$REMOTE_DIR" || { echo "Error: Remote directory '$REMOTE_DIR' not found."; exit 1; }

echo "Configuring git remote 'origin' URL to ${GIT_REMOTE_URL} on remote host..."
if git remote | grep -q "^origin$"; then
  git remote set-url origin "$GIT_REMOTE_URL"
else
  git remote add origin "$GIT_REMOTE_URL"
fi

if ! git diff-index --quiet HEAD -- || [ -n "$(git status --porcelain)" ]; then
  echo "Warning: Local changes on deployment host will be discarded."
fi

if [[ "$DEST" == "prod" ]]; then
  echo "Creating pre-deploy backup..."
  if [ -x "./scripts/backup.sh" ]; then
    if ! ./scripts/backup.sh --reason pre-deploy --tag "v${APP_VERSION}"; then
      echo "Error: Pre-deploy backup failed. Aborting update."
      exit 1
    fi
  else
    echo "Warning: scripts/backup.sh not found or not executable — skipping backup."
  fi
fi

if [[ "$DEST" == "stage" ]]; then
  echo "Syncing repository from origin/${DEPLOY_BRANCH}..."
  git fetch origin
  if [ $? -ne 0 ]; then
    echo "Error: Git fetch failed."
    exit 1
  fi
  git checkout "$DEPLOY_BRANCH" 2>/dev/null || git checkout -b "$DEPLOY_BRANCH" "origin/${DEPLOY_BRANCH}"
  git reset --hard "origin/${DEPLOY_BRANCH}"
  if [ $? -ne 0 ]; then
    echo "Error: Git reset to origin/${DEPLOY_BRANCH} failed."
    exit 1
  fi
else
  echo "Syncing repository from origin..."
  CURRENT_BRANCH="$(git branch --show-current)"
  if [ -z "$CURRENT_BRANCH" ]; then
    echo "Error: Could not determine current Git branch."
    exit 1
  fi

  git fetch --tags origin
  if [ $? -ne 0 ]; then
    echo "Error: Git fetch failed."
    exit 1
  fi

  git reset --hard "origin/${CURRENT_BRANCH}"
  if [ $? -ne 0 ]; then
    echo "Error: Git reset to origin/${CURRENT_BRANCH} failed."
    exit 1
  fi

  REMOTE_VERSION="$(tr -d '[:space:]' < VERSION)"
  if [ "$REMOTE_VERSION" != "$APP_VERSION" ]; then
    echo "Note: Remote VERSION file already points to next release (v${REMOTE_VERSION})."
    echo "      Building deployed release v${APP_VERSION}."
  fi
fi

export APP_VERSION="$APP_VERSION"

if [[ "$DEST" == "prod" ]]; then
  echo "Rebuilding Docker images without cache (APP_VERSION=${APP_VERSION})..."
  docker compose -f "$COMPOSE_FILE" build --no-cache
else
  echo "Rebuilding Docker images (APP_VERSION=${APP_VERSION})..."
  docker compose -f "$COMPOSE_FILE" build
fi
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
docker system prune -f || echo "Warning: Docker system prune failed."

echo "Waiting for services to become healthy..."
COUNTER=0
IS_READY=false

while [ $COUNTER -lt $MAX_WAIT ]; do
  STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$BACKEND_CONTAINER" 2>/dev/null || true)

  if [ "$STATUS" = "healthy" ]; then
    IS_READY=true
    break
  fi

  # End-to-end fallback via frontend nginx (covers missing/stale container health state)
  if curl -sf "http://127.0.0.1/api/health" | grep -q '"status":"ok"'; then
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
  echo "SUCCESS: ${DEST} environment updated and healthy!"
  echo " -> Version:            v${APP_VERSION}"
  echo " -> App Frontend:       ${APP_URL}"
  echo " -> Backend API Health: ${APP_URL}/api/health"
  echo "=================================================="
else
  echo "WARNING: Backend did not transition to healthy in time."
  echo "Check backend container logs:"
  echo " -> docker compose -f ${COMPOSE_FILE} logs backend"
  echo "=================================================="
  exit 3
fi
REMOTE_SCRIPT

REMOTE_EXIT=$?
echo "=================================================="
if [ $REMOTE_EXIT -eq 0 ]; then
  echo "${ENV_LABEL} update completed successfully on ${REMOTE_TARGET} (v${APP_VERSION})."
elif [ $REMOTE_EXIT -eq 3 ]; then
  echo "${ENV_LABEL} update finished, but the backend was not healthy in time on ${REMOTE_TARGET}."
else
  echo "${ENV_LABEL} update FAILED on ${REMOTE_TARGET} (exit code: ${REMOTE_EXIT})."
fi
echo "=================================================="
exit $REMOTE_EXIT
