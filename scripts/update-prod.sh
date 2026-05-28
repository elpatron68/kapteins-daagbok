#!/bin/bash

# Configuration
COMPOSE_FILE="docker-compose.yml"
BACKEND_CONTAINER="daagbox-prod-backend"

echo "=================================================="
# Translates to: Kapteins Daagbox Production Environment Update
echo "    Kapteins Daagbox Prod Environment Update     "
echo "=================================================="

# 1. Pull latest code changes
echo "Pulling latest changes from Git..."
git pull
if [ $? -ne 0 ]; then
  echo "Error: Git pull failed."
  exit 1
fi

# 2. Build docker images without cache
echo "Rebuilding Docker images without cache..."
docker compose -f $COMPOSE_FILE build --no-cache
if [ $? -ne 0 ]; then
  echo "Error: Docker compose build failed."
  exit 1
fi

# 3. Spin up the containers
echo "Starting updated container stack..."
docker compose -f $COMPOSE_FILE up -d
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
MAX_WAIT=35
COUNTER=0
IS_READY=false

while [ $COUNTER -lt $MAX_WAIT ]; do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' $BACKEND_CONTAINER 2>/dev/null)
  
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
docker compose -f $COMPOSE_FILE ps
echo "=================================================="

if [ "$IS_READY" = true ]; then
  echo "SUCCESS: Production environment updated and healthy!"
  echo " -> App Frontend (Nginx):  http://localhost"
  echo " -> Backend API Health:    http://localhost/api/health"
  echo "=================================================="
else
  echo "WARNING: Backend did not transition to healthy in time."
  echo "Check backend container logs for details:"
  echo " -> docker compose logs backend"
  echo "=================================================="
fi
