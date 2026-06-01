#!/bin/bash

# Configuration
SERVER_PORT=5000
CLIENT_PORT=5173
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

resolve_node_toolchain() {
  # Common install locations when login shell PATH is not loaded
  if command -v npm >/dev/null 2>&1; then
    return 0
  fi

  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh"
  elif [ -s "/usr/local/nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "/usr/local/nvm/nvm.sh"
  fi

  if [ -d "$HOME/.fnm" ] && command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env)"
  fi

  for candidate in \
    /usr/local/bin/npm \
    /usr/bin/npm \
    "$HOME/.local/share/fnm/current/bin/npm" \
    "$HOME/.nvm/versions/node/"*/bin/npm; do
    if [ -x "$candidate" ]; then
      export PATH="$(dirname "$candidate"):$PATH"
      break
    fi
  done

  command -v npm >/dev/null 2>&1
}

check_dev_env() {
  local env_file="$REPO_ROOT/.env"
  if [ ! -f "$env_file" ]; then
    echo "Warning: $env_file missing — copy from .env.example (RP_ID, ORIGIN, SESSION_SECRET)."
    return
  fi

  local origin_line origin_val
  origin_line=$(grep -E '^ORIGIN=' "$env_file" | tail -1 || true)
  origin_val="${origin_line#ORIGIN=}"
  origin_val="${origin_val%\"}"
  origin_val="${origin_val#\"}"
  local expected_origin="http://localhost:$CLIENT_PORT"
  if [ -n "$origin_val" ] && [ "$origin_val" != "$expected_origin" ]; then
    echo "Warning: ORIGIN=$origin_val — for Vite dev use ORIGIN=$expected_origin (session cookie + CORS)."
  fi

  local secret_line secret_val
  secret_line=$(grep -E '^SESSION_SECRET=' "$env_file" | tail -1 || true)
  secret_val="${secret_line#SESSION_SECRET=}"
  secret_val="${secret_val%\"}"
  secret_val="${secret_val#\"}"
  if [ -z "$secret_val" ]; then
    echo "Note: SESSION_SECRET is empty — backend uses a dev-only fallback (not for production)."
  elif [ "${#secret_val}" -lt 32 ]; then
    echo "Warning: SESSION_SECRET should be at least 32 characters."
  fi
}

require_node_toolchain() {
  if resolve_node_toolchain; then
    echo "Using Node $(node -v), npm $(npm -v)"
    return 0
  fi

  echo "Error: npm was not found in PATH."
  echo ""
  echo "This script starts local Vite/Express dev servers and requires Node.js 20+ with npm."
  echo "Install Node.js on this machine, or use the Docker-based stack instead:"
  echo "  ./scripts/start-dev-docker.sh"
  echo ""
  echo "On the production host, prefer updating the running stack:"
  echo "  docker compose -f docker-compose.yml up -d --build"
  echo "  # or from your workstation: ./scripts/update-prod.sh"
  exit 1
}

echo "========================================"
echo "   Kapteins Daagbok Dev Environment   "
echo "========================================"
echo "Preparing to (re)start services..."

require_node_toolchain
check_dev_env

# Clean up processes running on ports
cleanup_port() {
  local port=$1
  if command -v lsof >/dev/null 2>&1; then
    local pid=$(lsof -t -i:$port)
    if [ ! -z "$pid" ]; then
      echo "Port $port is currently in use by PID $pid. Stopping process..."
      kill -9 $pid 2>/dev/null
    fi
  elif command -v fuser >/dev/null 2>&1; then
    echo "Port $port is currently in use. Stopping process..."
    fuser -k $port/tcp 2>/dev/null
  fi
}

cleanup_port $SERVER_PORT
cleanup_port $CLIENT_PORT

# Clean exit handler
cleanup_all() {
  echo ""
  echo "Stopping all dev servers..."
  # Kill all child jobs
  kill $(jobs -p) 2>/dev/null
  exit 0
}

# Trap termination signals
trap cleanup_all SIGINT SIGTERM EXIT

# Manage PostgreSQL Docker container
if command -v docker >/dev/null 2>&1; then
  echo "Checking PostgreSQL Docker container (postgres-daagbox)..."
  if docker ps -a --format '{{.Names}}' | grep -Eq "^postgres-daagbox$"; then
    echo "Found existing postgres-daagbox container. Restarting..."
    docker restart postgres-daagbox >/dev/null
  else
    echo "postgres-daagbox container not found. Creating and starting a new one..."
    docker run -d \
      --name postgres-daagbox \
      -p 5432:5432 \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=daagbox \
      postgres:16 >/dev/null
  fi

  # Wait for PostgreSQL to be ready
  echo "Waiting for PostgreSQL database to be ready..."
  TIMEOUT=15
  COUNTER=0
  until docker exec postgres-daagbox pg_isready -U postgres >/dev/null 2>&1; do
    sleep 0.5
    COUNTER=$((COUNTER + 1))
    if [ $COUNTER -ge 30 ]; then
      echo "Warning: PostgreSQL did not start within $TIMEOUT seconds. Proceeding anyway..."
      break
    fi
  done
  if [ $COUNTER -lt 30 ]; then
    echo "PostgreSQL is ready!"
  fi
else
  echo "Warning: Docker command not found. Skipping PostgreSQL container management."
fi

# Sync Prisma client and database schema (dev)
sync_prisma_schema() {
  local server_dir="$REPO_ROOT/server"
  if [ ! -f "$server_dir/prisma/schema.prisma" ]; then
    return 0
  fi
  if [ ! -d "$server_dir/node_modules" ]; then
    echo "Warning: server/node_modules missing — skipping Prisma sync. Run: cd server && npm ci"
    return 0
  fi
  echo "Syncing Prisma client and database schema..."
  (
    cd "$server_dir" || exit 1
    npx prisma generate && npx prisma db push
  ) || {
    echo "Error: Prisma generate/db push failed. Check DATABASE_URL in .env and PostgreSQL."
    exit 1
  }
  echo "Prisma schema is in sync."
}

sync_prisma_schema

# Start backend server
echo "Starting backend API server..."
cd "$REPO_ROOT/server" || exit 1
if [ ! -d node_modules ]; then
  echo "Error: server/node_modules missing. Run: cd server && npm ci"
  exit 1
fi
npm run dev &
BACKEND_PID=$!
cd "$REPO_ROOT" || exit 1

# Sleep briefly to let server start up
sleep 1.5
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "Error: Backend dev server exited immediately. Check server logs above."
  exit 1
fi

# Start frontend client
echo "Starting frontend dev server..."
cd "$REPO_ROOT/client" || exit 1
if [ ! -d node_modules ]; then
  echo "Error: client/node_modules missing. Run: cd client && npm ci"
  kill "$BACKEND_PID" 2>/dev/null
  exit 1
fi
# Vite 6+ via plugin-react 4; refresh lockfile after package.json changes
if ! node -e "require.resolve('vite/package.json')" 2>/dev/null; then
  echo "Client dependencies incomplete — running npm ci..."
  npm ci || exit 1
fi
npm run dev &
CLIENT_PID=$!
cd "$REPO_ROOT" || exit 1

sleep 1.5
if ! kill -0 "$CLIENT_PID" 2>/dev/null; then
  echo "Error: Frontend dev server exited immediately. Check client logs above."
  kill "$BACKEND_PID" 2>/dev/null
  exit 1
fi

echo "========================================"
echo "Dev services are now running:"
echo " -> Backend:  http://localhost:$SERVER_PORT"
echo " -> Frontend: http://localhost:$CLIENT_PORT"
echo " -> API auth: HttpOnly session cookie (after Passkey login)"
echo " -> Health:   http://localhost:$SERVER_PORT/api/health"
echo "========================================"
echo "Press Ctrl+C to terminate both servers."
echo "========================================"

# Block to keep parent process alive
wait
