# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

# Copy package configurations
COPY package*.json ./

# Install all dependencies (including devDependencies for tsc)
RUN npm ci

# Copy Prisma schema and generate Client code
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and compile TypeScript
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# --- Production Runner Stage ---
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

# Copy package configurations
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy generated Prisma Client from builder stage
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built code and runtime configs
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

# Expose backend PORT
EXPOSE 5000

# Health check utilizing native http module to query the backend health API (which queries PG database)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:5000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Launch backend Express server
CMD ["node", "dist/index.js"]
