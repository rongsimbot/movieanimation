# ═══════════════════════════════════════════════════
# MovieAnimation.ai — Backend Dockerfile
# ═══════════════════════════════════════════════════
# Multi-stage build for production deployment
#
# Build:
#   docker build -t movieanimation-backend .
#
# Run (standalone):
#   docker run -p 3001:3001 --env-file .env.production movieanimation-backend

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (for TypeScript compilation)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npx tsc

# Prune dev dependencies
RUN npm prune --production

# ─── Production Stage ────────────────────────────────

FROM node:20-alpine

WORKDIR /app

# Install FFmpeg for video processing
RUN apk add --no-cache ffmpeg curl

# Copy production node_modules and compiled JS
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Create data directories
RUN mkdir -p /app/uploads /app/exports /app/previews /app/thumbnails /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3001

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start
CMD ["node", "dist/index.js"]
