#!/bin/bash

# Configuration
SERVER_PORT=5000
CLIENT_PORT=5173

echo "========================================"
echo "   Kapteins Daagbox Dev Environment   "
echo "========================================"
echo "Preparing to (re)start services..."

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

# Start backend server
echo "Starting backend API server..."
cd server
npm run dev &
cd ..

# Sleep briefly to let server start up
sleep 1.5

# Start frontend client
echo "Starting frontend dev server..."
cd client
npm run dev &
cd ..

echo "========================================"
echo "Dev services are now running:"
echo " -> Backend:  http://localhost:$SERVER_PORT"
echo " -> Frontend: http://localhost:$CLIENT_PORT"
echo "========================================"
echo "Press Ctrl+C to terminate both servers."
echo "========================================"

# Block to keep parent process alive
wait
