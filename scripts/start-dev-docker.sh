#!/bin/bash

# Configuration
COMPOSE_FILE="docker-compose.yml"
BACKEND_CONTAINER="daagbox-prod-backend"

echo "=================================================="
echo "   Kapteins Daagbox Docker Environment Manager    "
echo "=================================================="
echo "Stopping any existing container stack..."
docker compose -f $COMPOSE_FILE down

echo "Rebuilding and starting docker containers..."
docker compose -f $COMPOSE_FILE up --build -d

if [ $? -ne 0 ]; then
  echo "Error: Failed to spin up docker-compose stack."
  exit 1
fi

echo "Waiting for services to become healthy (Prisma migrations & DB check)..."
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
done

echo "=================================================="
echo "Container Statuses:"
docker compose -f $COMPOSE_FILE ps
echo "=================================================="

if [ "$IS_READY" = true ]; then
  echo "SUCCESS: Services are up and healthy!"
  echo " -> App Frontend (Nginx):  http://localhost"
  echo " -> Backend API Health:    http://localhost/api/health"
  echo "=================================================="
else
  echo "WARNING: Backend did not transition to healthy in time."
  echo "Check backend container logs for details:"
  echo " -> docker compose logs backend"
  echo "=================================================="
fi
