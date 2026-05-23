#!/bin/bash
# ═════════════════════════════════════════════════════════
# MovieAnimation.ai — Production Deploy Script
# ═════════════════════════════════════════════════════════
# Hybrid-Cloud: Azure Frontend + Local GPU Backend
#
# Usage: bash deploy.sh [--full] [--frontend-only] [--backend-only] [--skip-tests]
#
# This script handles the full deployment pipeline:
#   1. Pre-flight checks (DB, Redis, SSH tunnel)
#   2. Pull latest code from GitHub
#   3. Install dependencies & compile TypeScript
#   4. Run database migrations
#   5. Restart services (PM2 or Docker)
#   6. Health verification

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
TIMESTAMP=$(date -u '+%Y-%m-%d_%H-%M-%S')

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse flags
FULL_DEPLOY=true
FRONTEND_ONLY=false
BACKEND_ONLY=false
SKIP_TESTS=false

for arg in "$@"; do
  case $arg in
    --frontend-only) FRONTEND_ONLY=true; FULL_DEPLOY=false ;;
    --backend-only) BACKEND_ONLY=true; FULL_DEPLOY=false ;;
    --skip-tests) SKIP_TESTS=true ;;
  esac
done

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   MovieAnimation.ai — Production Deploy v1.0         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Step 1: Pre-flight Checks ────────────────────────

echo -e "${YELLOW}[1/7] Pre-flight checks...${NC}"

# Check Node.js
if ! command -v node &>/dev/null; then
  echo -e "${RED}❌ Node.js not found. Install Node.js 20+.${NC}"
  exit 1
fi
echo "  ✅ Node.js $(node -v)"

# Check npm
if ! command -v npm &>/dev/null; then
  echo -e "${RED}❌ npm not found.${NC}"
  exit 1
fi
echo "  ✅ npm $(npm -v)"

# Check Docker (for Redis)
if ! command -v docker &>/dev/null; then
  echo -e "${YELLOW}  ⚠️  Docker not found — Redis must be running separately${NC}"
else
  echo "  ✅ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
fi

# Check Redis
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "movieanimation-redis"; then
  echo "  ✅ Redis (Docker): Running"
elif command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null; then
  echo "  ✅ Redis: Running"
else
  echo -e "${RED}  ❌ Redis not running! Start with: docker run -d --name movieanimation-redis -p 6379:6379 redis:7-alpine${NC}"
  exit 1
fi

# Check SSH tunnel to PostgreSQL
if nc -z localhost 5432 2>/dev/null; then
  echo "  ✅ PostgreSQL port 5432: Accessible"
else
  echo -e "${RED}  ❌ PostgreSQL port 5432 not accessible — check SSH tunnel${NC}"
  echo "     ssh -p 2222 -L 5432:localhost:5432 simrobotics@localhost -Nf"
  exit 1
fi

# Check FFmpeg
if command -v ffmpeg &>/dev/null; then
  echo "  ✅ FFmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
else
  echo -e "${RED}  ❌ FFmpeg not found. Install: sudo apt-get install ffmpeg${NC}"
  exit 1
fi

echo ""

# ─── Step 2: Pull Latest Code ─────────────────────────

if [ "$FRONTEND_ONLY" = false ]; then
  echo -e "${YELLOW}[2/7] Updating code from GitHub...${NC}"
  cd "$PROJECT_DIR"
  
  # Get current branch
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  echo "  Branch: $CURRENT_BRANCH"
  
  # Stash any local changes
  if ! git diff --quiet 2>/dev/null; then
    echo "  Stashing local changes..."
    git stash save "auto-stash-deploy-$TIMESTAMP"
  fi
  
  # Pull
  git pull origin "$CURRENT_BRANCH"
  echo "  ✅ Code updated"
  echo ""
fi

# ─── Step 3: Install Dependencies & Build ─────────────

if [ "$FRONTEND_ONLY" = false ]; then
  echo -e "${YELLOW}[3/7] Building backend...${NC}"
  cd "$BACKEND_DIR"
  
  # Install dependencies
  npm ci --production 2>/dev/null || npm install
  echo "  ✅ Dependencies installed"
  
  # Compile TypeScript
  npx tsc
  echo "  ✅ TypeScript compiled"
  echo ""
fi

if [ "$BACKEND_ONLY" = false ]; then
  echo -e "${YELLOW}[3b/7] Building frontend...${NC}"
  cd "$FRONTEND_DIR"
  
  npm ci 2>/dev/null || npm install
  npx next build
  echo "  ✅ Frontend built"
  echo ""
fi

# ─── Step 4: Database Migrations ──────────────────────

if [ "$FRONTEND_ONLY" = false ]; then
  echo -e "${YELLOW}[4/7] Running database migrations...${NC}"
  cd "$BACKEND_DIR"
  
  for migration in src/migrations/*.sql; do
    echo "  Running: $(basename $migration)"
    PGPASSWORD='SimData_Vector_2026!' psql -h localhost -p 5432 -U sim_admin -d movieanimation -f "$migration" -q 2>&1 | grep -v "already exists" || true
  done
  echo "  ✅ Migrations complete"
  echo ""
fi

# ─── Step 5: Restart Services ─────────────────────────

if [ "$FRONTEND_ONLY" = false ]; then
  echo -e "${YELLOW}[5/7] Restarting backend service...${NC}"
  
  # Production env
  cp "$BACKEND_DIR/.env.production" "$BACKEND_DIR/.env"
  
  # Generate JWT secret if not set
  if grep -q "CHANGE_ME" "$BACKEND_DIR/.env" 2>/dev/null; then
    JWT_SECRET=$(openssl rand -base64 64)
    sed -i "s/CHANGE_ME_GENERATE_WITH_openssl_rand_base64_64/$JWT_SECRET/" "$BACKEND_DIR/.env"
    echo "  ✅ Generated JWT secret"
  fi
  
  # Check if Docker deployment
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "movieanimation-backend"; then
    echo "  Using Docker deployment..."
    cd "$PROJECT_DIR"
    docker compose -f docker-compose.prod.yml build backend
    docker compose -f docker-compose.prod.yml up -d backend
  elif command -v pm2 &>/dev/null; then
    echo "  Using PM2 deployment..."
    pm2 restart movieanimation-api 2>/dev/null || \
      pm2 start "$BACKEND_DIR/dist/index.js" --name "movieanimation-api"
    pm2 save
  else
    echo "  ⚠️  No process manager found — starting directly"
    cd "$BACKEND_DIR"
    nohup node dist/index.js > /tmp/movieanimation-api.log 2>&1 &
    echo "  ✅ Started (PID: $!)"
  fi
  echo ""
fi

# ─── Step 6: Health Verification ──────────────────────

echo -e "${YELLOW}[6/7] Health verification...${NC}"

# Wait for service to start
sleep 3
MAX_RETRIES=10
RETRY=0
while [ $RETRY -lt $MAX_RETRIES ]; do
  HEALTH=$(curl -s --max-time 5 http://localhost:3001/api/health 2>/dev/null)
  if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo "  ✅ Backend healthy"
    break
  fi
  RETRY=$((RETRY + 1))
  echo "  Waiting for backend... ($RETRY/$MAX_RETRIES)"
  sleep 2
done

if [ $RETRY -ge $MAX_RETRIES ]; then
  echo -e "${RED}  ❌ Backend health check failed${NC}"
  echo "  Check logs: pm2 logs movieanimation-api or docker logs movieanimation-backend"
  exit 1
fi

echo ""

# ─── Step 7: Deploy Summary ───────────────────────────

echo -e "${YELLOW}[7/7] Deployment Summary...${NC}"

# Get service info
VERSION=$(curl -s http://localhost:3001/api/health | python3 -c "import sys, json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "unknown")
DB_STATUS=$(curl -s http://localhost:3001/api/health | python3 -c "import sys, json; print(json.load(sys.stdin)['database'])" 2>/dev/null || echo "unknown")
FEATURES_COUNT=$(curl -s http://localhost:3001/api/health | python3 -c "import sys, json; print(len(json.load(sys.stdin)['features']))" 2>/dev/null || echo "0")

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Deployment Complete!                              ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Version:  v$VERSION                                    ${NC}"
echo -e "${GREEN}║  Database: $DB_STATUS                                    ${NC}"
echo -e "${GREEN}║  Features: $FEATURES_COUNT active                              ${NC}"
echo -e "${GREEN}║  API:      http://localhost:3001/api                  ${NC}"
echo -e "${GREEN}║  Health:   http://localhost:3001/api/health            ${NC}"
echo -e "${GREEN}║                                                        ${NC}"
echo -e "${GREEN}║  Frontend: https://movieanimation.ai                   ${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Post-deploy checklist:                                ${NC}"
echo -e "${GREEN}║  ☐ Verify SSL certificate                             ${NC}"
echo -e "${GREEN}║  ☐ Test login/registration                            ${NC}"
echo -e "${GREEN}║  ☐ Test video generation (1 scene)                    ${NC}"
echo -e "${GREEN}║  ☐ Test timeline assembly                             ${NC}"
echo -e "${GREEN}║  ☐ Test export + download                             ${NC}"
echo -e "${GREEN}║  ☐ Check analytics tracking                           ${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Cleanup
if git stash list 2>/dev/null | grep -q "auto-stash-deploy-$TIMESTAMP"; then
  echo -e "${YELLOW}Note: Local changes were stashed. Restore with: git stash pop${NC}"
fi

echo "Deploy timestamp: $TIMESTAMP UTC"
exit 0
