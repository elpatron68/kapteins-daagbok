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

RUN apk add --no-cache gettext

COPY client/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY client/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built assets from builder
COPY --from=builder /app/dist .

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
