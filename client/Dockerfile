# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app

ARG APP_VERSION=0.1.0.0-dev
ENV VITE_APP_VERSION=$APP_VERSION

# Install dependencies
COPY client/package*.json ./
RUN npm ci

# Copy client sources and repo version file
COPY client/ .
COPY VERSION ./VERSION
RUN npm run build

# --- Production Stage ---
FROM nginx:1.25-alpine
WORKDIR /usr/share/nginx/html

# Copy custom Nginx configuration
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist .

# Expose HTTP port
EXPOSE 80

# Health check to verify Nginx is actively running
HEALTHCHECK --interval=30s --timeout=5s --start-period=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1
