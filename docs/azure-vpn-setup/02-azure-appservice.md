# 02 — Azure App Service with Tailscale VPN

**Estimated Time:** 45 minutes  
**Prerequisites:** Tailscale deployed on local nodes (01-tailscale-deployment.md)

---

## Overview

Azure App Service runs the Next.js frontend. It needs Tailscale in **userspace networking mode** because App Service containers don't have `/dev/net/tun` (no kernel WireGuard). Tailscale's `--tun=userspace-networking` mode plus SOCKS5 proxy solves this.

```
┌──────────────────────────────────────┐
│  Azure App Service Container          │
│                                       │
│  PORT 8080                            │
│  ┌────────────────────────────────┐   │
│  │  Next.js Server                │   │
│  │  ├─ DB Queries ──► SOCKS5 ────┼───┼──► 127.0.0.1:1055
│  │  └─ GPU API    ──► SOCKS5 ────┼───┼──► Tailscale Userspace
│  └────────────────────────────────┘   │       │
│                                       │       │ WireGuard
│  ┌────────────────────────────────┐   │       │ Encrypted
│  │  tailscaled                    │   │       │
│  │  --tun=userspace-networking    │   │       │
│  │  --socks5-server=:1055        │   │       ▼
│  │  --state=/tmp/tailscale.state  │   │   Tailnet Mesh
│  └────────────────────────────────┘   │   100.64.0.0/10
└──────────────────────────────────────┘
```

---

## Step 1: Build the Docker Image

### 1.1 Dockerfile
Use the provided Dockerfile from `docs/azure-vpn-setup/Dockerfile.azure`:

```bash
cd ~/.openclaw/workspace/projects/movieanimation

# Build the image
docker build \
  -f docs/azure-vpn-setup/Dockerfile.azure \
  -t movieanimation-azure:latest \
  .
```

### 1.2 Test Locally (Optional)
```bash
# Run with a test auth key
docker run --rm -it \
  -e TAILSCALE_AUTHKEY="tskey-auth-kYYYY..." \
  -e DATABASE_URL="postgresql://sim_admin:password@rtx3060-db:5432/movieanimation_db" \
  -e MAP_API_KEY="map-sk-test" \
  -p 8080:8080 \
  movieanimation-azure:latest

# In another terminal, check Tailscale
docker exec <container-id> tailscale status
docker exec <container-id> tailscale ip -4
```

---

## Step 2: Push to Azure Container Registry

### Option A: Azure Container Registry (Recommended)

```bash
# Login to Azure
az login

# Create ACR (if not exists)
az acr create \
  --resource-group movieanimation-rg \
  --name movieanimationacr \
  --sku Basic \
  --location eastus

# Login to ACR
az acr login --name movieanimationacr

# Tag and push
docker tag movieanimation-azure:latest movieanimationacr.azurecr.io/movieanimation-azure:latest
docker push movieanimationacr.azurecr.io/movieanimation-azure:latest
```

### Option B: Docker Hub

```bash
docker tag movieanimation-azure:latest rongsimbot/movieanimation-azure:latest
docker push rongsimbot/movieanimation-azure:latest
```

---

## Step 3: Create Azure App Service

```bash
# Create App Service Plan
az appservice plan create \
  --resource-group movieanimation-rg \
  --name movieanimation-plan \
  --sku B1 \
  --is-linux \
  --location eastus

# Create App Service (with ACR)
az webapp create \
  --resource-group movieanimation-rg \
  --plan movieanimation-plan \
  --name movieanimation-frontend \
  --deployment-container-image-name movieanimationacr.azurecr.io/movieanimation-azure:latest

# Enable managed identity for ACR pull
az webapp identity assign \
  --resource-group movieanimation-rg \
  --name movieanimation-frontend

# Grant ACR pull permission
PRINCIPAL_ID=$(az webapp identity show --resource-group movieanimation-rg --name movieanimation-frontend --query principalId -o tsv)
ACR_ID=$(az acr show --name movieanimationacr --query id -o tsv)
az role assignment create --assignee "$PRINCIPAL_ID" --role AcrPull --scope "$ACR_ID"
```

---

## Step 4: Configure Environment Variables

```bash
# Set all required environment variables
az webapp config appsettings set \
  --resource-group movieanimation-rg \
  --name movieanimation-frontend \
  --settings \
    TAILSCALE_AUTHKEY="tskey-auth-kYYYY..." \
    DATABASE_URL="postgresql://sim_admin:${DB_PASSWORD}@rtx3060-db:5432/movieanimation_db?sslmode=require" \
    MAP_API_KEY="map-sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
    MAP_API_BASE="http://dell-gb10:8000" \
    TAILSCALE_SOCKS5="socks5://127.0.0.1:1055" \
    NODE_ENV="production" \
    JWT_SECRET="${JWT_SECRET}" \
    WEBSITES_PORT="8080" \
    WEBSITES_ENABLE_APP_SERVICE_STORAGE="false"
```

### Environment Variable Reference

| Variable | Value | Purpose |
|----------|-------|---------|
| `TAILSCALE_AUTHKEY` | `tskey-auth-k...` | Ephemeral auth key for Tailscale join |
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection via Tailscale DNS |
| `MAP_API_KEY` | `map-sk-...` | Internal API key for MAP-API auth |
| `MAP_API_BASE` | `http://dell-gb10:8000` | MAP-API base URL (resolved via MagicDNS) |
| `TAILSCALE_SOCKS5` | `socks5://127.0.0.1:1055` | Local SOCKS5 proxy for VPN routing |
| `NODE_ENV` | `production` | Production mode |
| `WEBSITES_PORT` | `8080` | Port Azure routes traffic to |

---

## Step 5: Verify Deployment

### 5.1 Check Container Logs
```bash
az webapp log tail \
  --resource-group movieanimation-rg \
  --name movieanimation-frontend

# Look for:
# ✅ Tailscale connected!
# 🌐 Tailscale IP: 100.64.1.10
# 🎬 Starting Next.js server on port 8080
```

### 5.2 Test Connectivity from Azure
```bash
# SSH into the App Service container
az webapp ssh \
  --resource-group movieanimation-rg \
  --name movieanimation-frontend

# Inside the container:
tailscale status           # Should show all nodes
tailscale ip -4            # Should show 100.64.1.10

# Test MAP-API via SOCKS5
curl --socks5 localhost:1055 http://dell-gb10:8000/health
# Expected: {"status": "healthy", "node": "dell-gb10"}

# Test PostgreSQL via SOCKS5
apt-get update && apt-get install -y postgresql-client
psql "postgresql://sim_admin@rtx3060-db:5432/movieanimation_db" -c "SELECT 1"
# Expected: 1
```

### 5.3 Public Health Check
```bash
# Test the public endpoint
curl https://movieanimation-frontend.azurewebsites.net/api/health
# Expected: {"status": "ok", "db": true, "gpu": true}
```

### 5.4 Test from Local Nodes
```bash
# From Dell GB10, test Azure reachability
tailscale ping movieanimation-azure

# From Ronnie's laptop
curl http://movieanimation-azure:8080/api/health
```

---

## Step 6: Configure Custom Domain (Optional)

```bash
# Add custom domain
az webapp config hostname add \
  --resource-group movieanimation-rg \
  --webapp-name movieanimation-frontend \
  --hostname movieanimation.ai

# Enable HTTPS
az webapp config ssl bind \
  --resource-group movieanimation-rg \
  --name movieanimation-frontend \
  --certificate-thumbprint <thumbprint> \
  --ssl-type SNI
```

Or use Cloudflare for SSL termination (recommended):
1. Point `movieanimation.ai` CNAME → `movieanimation-frontend.azurewebsites.net`
2. Enable Cloudflare proxy (orange cloud)
3. Set SSL mode to "Full" (strict)
4. Create Page Rule: `movieanimation.ai/*` → Cache Level: Standard

---

## Step 7: Configure Auto-Scaling (Optional)

```bash
# Set auto-scale rules
az monitor autoscale create \
  --resource-group movieanimation-rg \
  --resource movieanimation-plan \
  --resource-type Microsoft.Web/serverFarms \
  --name movieanimation-autoscale \
  --min-count 1 \
  --max-count 3 \
  --count 1

# Scale out when CPU > 70%
az monitor autoscale rule create \
  --resource-group movieanimation-rg \
  --autoscale-name movieanimation-autoscale \
  --condition "CpuPercentage > 70 avg 5m" \
  --scale out 1
```

> **⚠️ Note:** Each new instance gets a NEW Tailscale ephemeral node (unique IP). Make sure your auth key is reusable or generate enough ephemeral keys.

---

## CI/CD Setup (GitHub Actions)

Create `.github/workflows/deploy-azure.yml`:

```yaml
name: Deploy to Azure App Service

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to Azure
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Login to ACR
        uses: azure/docker-login@v1
        with:
          login-server: movieanimationacr.azurecr.io
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Build and push Docker image
        run: |
          docker build -f docs/azure-vpn-setup/Dockerfile.azure \
            -t movieanimationacr.azurecr.io/movieanimation-azure:${{ github.sha }} \
            -t movieanimationacr.azurecr.io/movieanimation-azure:latest .
          docker push movieanimationacr.azurecr.io/movieanimation-azure:${{ github.sha }}
          docker push movieanimationacr.azurecr.io/movieanimation-azure:latest

      - name: Deploy to App Service
        uses: azure/webapps-deploy@v2
        with:
          app-name: movieanimation-frontend
          images: movieanimationacr.azurecr.io/movieanimation-azure:${{ github.sha }}
```

---

## Troubleshooting

### Container starts but Tailscale fails
```bash
# Check startup logs
az webapp log tail --resource-group movieanimation-rg --name movieanimation-frontend

# Common issues:
# - TAILSCALE_AUTHKEY expired: Generate new ephemeral key
# - Auth key already used: Ephemeral keys are one-time; generate new
# - Missing tag: Key must have tag:azure-frontend
```

### Can't reach MAP-API from Azure
```bash
# SSH into container
az webapp ssh --resource-group movieanimation-rg --name movieanimation-frontend

# Check Tailscale status
tailscale status

# Check SOCKS5 proxy
curl --socks5 localhost:1055 http://dell-gb10:8000/health

# If "connection refused", check ACLs in Tailscale Admin Console
```

### App Service keeps restarting
- Check if `WEBSITES_PORT=8080` is set
- Verify the startup script doesn't exit before Next.js starts
- Check memory: B1 has 1.75GB — Tailscale + Next.js should be ~500MB

---

**Next:** Configure PostgreSQL for VPN access → `03-postgresql-vpn.md`
