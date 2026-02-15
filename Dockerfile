# ═══════════════════════════════════════════════════════════════════════════
# MCP SERVER DOCKERFILE
# ═══════════════════════════════════════════════════════════════════════════
#
# Multi-stage Dockerfile for building and running the MCP server.
#
# IMPORTANT: The database must be pre-built BEFORE running docker build.
# It is NOT built during the Docker build because the full DB includes
# ingested data (12K+ case law entries) that requires hours of network
# scraping. Build it locally first, then bake it into the image.
#
# Free tier (seeds only, ~45 MB):
#   npm run build:db
#   docker build -t danish-law-mcp .
#
# Full tier (seeds + ingested case law, ~80 MB):
#   npm run build:db
#   npm run ingest:cases:full-archive
#   npm run build:db:paid
#   docker build -t danish-law-mcp .
#
# ═══════════════════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────────────────
# STAGE 1: BUILD
# ───────────────────────────────────────────────────────────────────────────
# Compiles TypeScript to JavaScript
# ───────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install ALL dependencies (including dev)
# --ignore-scripts prevents postinstall from running
RUN npm ci --ignore-scripts

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript
RUN npm run build

# ───────────────────────────────────────────────────────────────────────────
# STAGE 2: PRODUCTION
# ───────────────────────────────────────────────────────────────────────────
# Minimal image with only production dependencies
# ───────────────────────────────────────────────────────────────────────────

FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Copy pre-built database
# This file MUST exist — run `npm run build:db` (or full pipeline) first
COPY data/database.db ./data/database.db

# ───────────────────────────────────────────────────────────────────────────
# SECURITY
# ───────────────────────────────────────────────────────────────────────────
# Create and use non-root user
# ───────────────────────────────────────────────────────────────────────────

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
USER nodejs

# ───────────────────────────────────────────────────────────────────────────
# ENVIRONMENT
# ───────────────────────────────────────────────────────────────────────────

# Production mode
ENV NODE_ENV=production

# Database path (matches the COPY destination above)
ENV DANISH_LAW_DB_PATH=/app/data/database.db

# ───────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ───────────────────────────────────────────────────────────────────────────
# MCP servers use stdio, so we run node directly
# ───────────────────────────────────────────────────────────────────────────

CMD ["node", "dist/index.js"]
