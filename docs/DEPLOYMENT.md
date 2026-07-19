# MovieAnimation.ai — Deployment Runbook
## Phase 12: Production Deployment

**Last Updated:** 2026-05-23
**Architecture:** Hybrid-Cloud (Azure Frontend + Local GPU Backend)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Internet 🌐                                             │
│    │                                                     │
│    ▼                                                     │
│  Azure Cloud (Frontend)                                  │
│  ├── Vercel/Next.js (movieanimation.ai)                 │
│  └── Tailscale VPN Tunnel                                │
│    │                                                     │
│    ▼ (encrypted via Tailscale)                           │
│  SimRobotics LAN (San Antonio, TX)                       │
│  ├── LoServer (Ubuntu)                                   │
│  │   ├── Nginx (SSL reverse proxy)                      │
│  │   ├── MovieAnimation Backend (Node.js :3001)         │
│  │   ├── Redis (BullMQ job queue :6379)                 │
│  │   └── Movie Render Pipeline (FFmpeg)                  │
│  └── RTX 3060 Node (WSL2/Windows)                       │
│      └── PostgreSQL (movieanimation_db :5432)           │
└─────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### System Requirements
- **LoServer:** Ubuntu 22.04+, 4+ CPU cores, 8GB+ RAM, 100GB+ storage
- **RTX 3060 Node:** Windows 10/11 + WSL2, PostgreSQL 15+
- **Docker:** 24+ (for Redis, optional backend containerization)
- **Node.js:** 20 LTS
- **FFmpeg:** 6.0+ (installed on backend server)
- **GitHub:** CLI (`gh`) authenticated for automated deployments

### Network
- SSH tunnel: `loserver` → `RTX 3060` (Port 2222, established via WSL2)
- Tailscale: VPN tunnel between Azure and SimRobotics LAN
- Ports: 80 (HTTP), 443 (HTTPS), 6379 (Redis, internal), 3001 (API, internal)

---

## Step 1: Database Setup

### Verify PostgreSQL Connectivity
```bash
# From LoServer, test the SSH tunnel
ssh -p 2222 -o ConnectTimeout=5 simrobotics@localhost "echo OK"

# Test PostgreSQL connection
PGPASSWORD='SimData_Vector_2026!' psql -h localhost -p 5432 -U sim_admin -d movieanimation -c "SELECT version();"
```

### Run Migrations
```bash
cd ~/.openclaw/workspace/projects/movieanimation/backend

# List migration files
ls src/migrations/

# Run migrations in order:
PGPASSWORD='SimData_Vector_2026!' psql -h localhost -p 5432 -U sim_admin -d movieanimation -f src/migrations/007_timeline_tables.sql
PGPASSWORD='SimData_Vector_2026!' psql -h localhost -p 5432 -U sim_admin -d movieanimation -f src/migrations/009_phase8_exports.sql
PGPASSWORD='SimData_Vector_2026!' psql -h localhost -p 5432 -U sim_admin -d movieanimation -f src/migrations/010_phase5_previews.sql
```

### Verify Schema
```bash
PGPASSWORD='SimData_Vector_2026!' psql -h localhost -p 5432 -U sim_admin -d movieanimation -c "\dt"
```

---

## Step 2: Redis Setup

```bash
# Start Redis via Docker (if not running)
docker ps | grep movieanimation-redis || \
  docker run -d --name movieanimation-redis --restart unless-stopped \
    -p 6379:6379 redis:7-alpine \
    redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru

# Verify
docker exec movieanimation-redis redis-cli ping
# Expected: PONG
```

---

## Step 3: Backend Deployment

### Option A: Direct (Development/Testing)
```bash
cd ~/.openclaw/workspace/projects/movieanimation/backend

# Install dependencies
npm ci --production

# Copy production config
cp .env.production .env

# Generate production JWT secret
JWT_SECRET=$(openssl rand -base64 64)
sed -i "s/CHANGE_ME_GENERATE_WITH_openssl_rand_base64_64/$JWT_SECRET/" .env

# Start with PM2 (process manager)
pm2 start npm --name "movieanimation-api" -- run start
pm2 save
pm2 startup
```

### Option B: Docker (Production)
```bash
cd ~/.openclaw/workspace/projects/movieanimation

# Build and start
docker compose -f docker-compose.prod.yml up -d --build

# Check logs
docker compose -f docker-compose.prod.yml logs -f backend

# Verify
curl http://localhost:3001/api/health
```

---

## Step 4: Nginx SSL Setup

### Install Certbot & Get SSL Certificate
```bash
# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Generate certificate (ensure DNS points to this server)
sudo certbot certonly --standalone \
  -d movieanimation.ai \
  -d www.movieanimation.ai \
  --email support@movieanimation.ai \
  --agree-tos \
  --non-interactive

# Copy certs to nginx SSL directory
sudo cp /etc/letsencrypt/live/movieanimation.ai/fullchain.pem \
  ~/.openclaw/workspace/projects/movieanimation/nginx/ssl/fullchain.pem

sudo cp /etc/letsencrypt/live/movieanimation.ai/privkey.pem \
  ~/.openclaw/workspace/projects/movieanimation/nginx/ssl/privkey.pem

# Auto-renewal
sudo crontab -l | { cat; echo "0 3 * * * certbot renew --quiet && docker restart movieanimation-nginx"; } | sudo crontab -
```

### Manual SSL (if certbot unavailable)
```bash
# Generate self-signed (development only)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/privkey.pem \
  -out nginx/ssl/fullchain.pem \
  -subj "/CN=movieanimation.ai"
```

### Start/Restart Nginx
```bash
docker compose -f docker-compose.prod.yml up -d nginx
docker exec movieanimation-nginx nginx -t   # Test config
docker exec movieanimation-nginx nginx -s reload  # Reload
```

---

## Step 5: Frontend Deployment

### Vercel (Recommended)
```bash
cd ~/.openclaw/workspace/projects/movieanimation/frontend

# Deploy to Vercel
vercel --prod
```

### Environment Variables (Vercel Dashboard)
| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://movieanimation.ai/api` |
| `NEXT_PUBLIC_SITE_URL` | `https://movieanimation.ai` |

---

## Step 6: Tailscale VPN (Azure → Local)

### Automated Setup (Recommended)
```bash
# From LoServer
cd ~/.openclaw/workspace/projects/movieanimation/infrastructure/azure-vpn/tailscale
sudo TAILSCALE_AUTH_KEY="tskey-auth-..." ./setup.sh
```

### Manual Setup
```bash
# Install Tailscale on both Azure VM and LoServer
curl -fsSL https://tailscale.com/install.sh | sh

# Start and authenticate
sudo tailscale up --authkey=<TAILSCALE_AUTH_KEY>

# Verify connection
tailscale status
# Should show both nodes as active
```

### Configure ACL Rules
Upload the ACL config to Tailscale admin console:
```bash
cat infrastructure/azure-vpn/tailscale/tailscale-acl.json
# Copy/paste into: https://login.tailscale.com/admin/acls
```

### Full Documentation
See `infrastructure/azure-vpn/ARCHITECTURE.md` for complete VPN architecture details.

---

## Step 7: Health Verification

### Checklist
```bash
# 1. Backend health
curl -s https://movieanimation.ai/api/health | jq .status
# Expected: "ok"

# 2. Database connectivity
curl -s https://movieanimation.ai/api/health | jq .database
# Expected: "connected"

# 3. Redis
docker exec movieanimation-redis redis-cli ping
# Expected: PONG

# 4. PostgreSQL
PGPASSWORD='SimData_Vector_2026!' psql -h localhost -p 5432 -U sim_admin -d movieanimation -c "SELECT count(*) FROM users;"

# 5. SSL
curl -sI https://movieanimation.ai/api/health | grep -i "strict-transport-security"

# 6. Frontend
curl -sI https://movieanimation.ai | grep "200 OK"

# 7. API features
curl -s https://movieanimation.ai/api/health | jq '.features | length'
# Expected: 59
```

---

## Rolling Back

```bash
# Revert to previous git commit
cd ~/.openclaw/workspace/projects/movieanimation
git log --oneline -5  # Find previous commit hash
git reset --hard <previous_commit_hash>

# Restart backend
pm2 restart movieanimation-api

# Or Docker
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## Monitoring

### Logs
```bash
# Backend logs
pm2 logs movieanimation-api --lines 100

# Nginx logs
docker exec movieanimation-nginx tail -f /var/log/nginx/access.log

# Redis logs
docker logs -f movieanimation-redis

# PostgreSQL logs (on RTX 3060 WSL2)
tail -f /var/log/postgresql/postgresql-15-main.log
```

### Metrics
- **Health Endpoint:** `GET /api/health` — Real-time service status
- **Analytics:** `GET /api/analytics/usage` — DAU, MAU, total users
- **Costs:** `GET /api/analytics/costs` — API spending by provider
- **Cache:** `GET /api/analytics/cache` — Hit/miss rates

### Alert Conditions
| Metric | Threshold | Action |
|--------|----------|--------|
| Health status ≠ "ok" | Immediate | Check DB + Redis connectivity |
| p95 latency > 2000ms | Warn | Investigate DB queries / FFmpeg load |
| API error rate > 10% | Critical | Check API key validity, rate limits |
| DB connections > 90% | Warn | Scale connection pool |
| Redis memory > 80% | Warn | Increase maxmemory or prune |

---

## Troubleshooting

### Issue: Backend can't connect to PostgreSQL
```bash
# Check SSH tunnel
ssh -p 2222 -o ConnectTimeout=5 simrobotics@localhost "echo OK"
# If failed: restart the SSH tunnel
```

### Issue: Redis connection refused
```bash
# Restart Redis
docker restart movieanimation-redis
# Check memory
docker stats movieanimation-redis
```

### Issue: Video generation fails
```bash
# Check API keys in .env
grep "API_KEY" backend/.env
# Verify Luma/Runway API key validity
curl -s -H "Authorization: luma-..." https://api.lumalabs.ai/v1/health
```

### Issue: Nginx returns 502
```bash
# Check backend is running
curl http://localhost:3001/api/health
# Restart if needed
pm2 restart movieanimation-api
```

---

## Post-Deployment Tasks

- [ ] Register/verify SSL certificate
- [ ] Set up DNS A records for movieanimation.ai → Azure IP
- [ ] Configure Tailscale auto-start on boot
- [ ] Set up PM2/Docker auto-restart policies
- [ ] Configure firewall (UFW): allow 80, 443; block everything else externally
- [ ] Add monitoring alerts (health endpoint ping)
- [ ] Set up database backups (cron job: `pg_dump` daily)
- [ ] Document SSH tunnel auto-restart script
- [ ] Seed beta test user accounts

---

## Contact

- **Infrastructure issues:** SimCoder agent
- **API issues:** SimAnalyst agent  
- **Urgent:** Ronnie Gaines (CEO) — rong@simrobotics.com

---
**Runbook Version:** 1.0  
**Last Verified:** 2026-05-23
