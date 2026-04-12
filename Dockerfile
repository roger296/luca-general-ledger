# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install backend dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Install and build frontend
COPY src/web/package.json src/web/package-lock.json* ./src/web/
RUN npm ci --prefix src/web
COPY src/web ./src/web
RUN npm run build --prefix src/web

# Build TypeScript backend
COPY tsconfig.json knexfile.ts ./
COPY src ./src
RUN npm run build

# ── Stage 2: Production ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled backend
COPY --from=builder /app/dist ./dist

# Copy migrations, seeds, and knexfile (needed at runtime via tsx)
COPY --from=builder /app/src/db ./src/db
COPY --from=builder /app/knexfile.ts ./knexfile.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Copy built frontend assets
COPY --from=builder /app/src/web/dist ./src/web/dist

# Install tsx for running migrations at runtime
RUN npm install tsx typescript --save-dev

# Create data directories
RUN mkdir -p /data/chains /data/documents /app/logs

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Run migrations (idempotent), then start
CMD ["sh", "-c", "npm run migrate && node dist/server.js"]
