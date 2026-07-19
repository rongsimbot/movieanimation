# Azure VPN Setup Guide — MovieAnimation.ai

**Hybrid-Cloud Architecture:** Azure App Service ↔ Tailscale VPN ↔ SimRobotics LAN

---

## Directory Index

| File | Description |
|------|-------------|
| `README.md` | This index — quick start and overview |
| `PREREQUISITES.md` | Complete prerequisites checklist |
| `01-tailscale-deployment.md` | Tailscale VPN setup on all nodes (Azure + local) |
| `02-azure-appservice.md` | Azure App Service deployment with Tailscale sidecar |
| `03-postgresql-vpn.md` | PostgreSQL secure configuration for VPN access |
| `04-gpu-rendering-routing.md` | GPU rendering API request routing |
| `05-firewall-security.md` | Firewall rules and security groups |
| `06-monitoring.md` | VPN health monitoring and alerting |
| `Dockerfile.azure` | Dockerfile for Azure App Service with Tailscale |
| `startup.sh` | Container startup script (Tailscale + Next.js) |
| `map-api.service` | MAP-API systemd unit for Dell GB10 |
| `tailscale-acl.json` | Tailscale access control policy |
| `firewall-gb10.sh` | iptables rules for Dell GB10 |
| `firewall-rtx3060.sh` | iptables rules for RTX 3060 |
| `postgresql-vpn.conf` | PostgreSQL configuration snippets |

---

## Quick Start

### 1. Prerequisites (10 min)
```bash
# Read the full list
cat docs/azure-vpn-setup/PREREQUISITES.md
```
At minimum: Tailscale account, Azure subscription, SSH access to Dell GB10 and RTX 3060.

### 2. Deploy Tailscale on Local Nodes (15 min)
```bash
# On Dell GB10 (MAP-API server)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-tags=tag:gpu-server --hostname=dell-gb10

# On RTX 3060 (PostgreSQL server)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-tags=tag:database --hostname=rtx3060-db
```
Follow detailed guide: `01-tailscale-deployment.md`

### 3. Deploy Azure App Service with Tailscale (30 min)
```bash
# Build and push Docker image
cd ~/.openclaw/workspace/projects/movieanimation
docker build -f docs/azure-vpn-setup/Dockerfile.azure -t movieanimation-azure .
# Deploy via Azure CLI or GitHub Actions
```
Follow detailed guide: `02-azure-appservice.md`

### 4. Configure PostgreSQL for VPN (10 min)
```bash
# On RTX 3060
sudo cp docs/azure-vpn-setup/postgresql-vpn.conf /etc/postgresql/16/main/conf.d/
sudo systemctl restart postgresql
```
Follow detailed guide: `03-postgresql-vpn.md`

### 5. Apply Firewall Rules (5 min)
```bash
# On Dell GB10
sudo bash docs/azure-vpn-setup/firewall-gb10.sh

# On RTX 3060
sudo bash docs/azure-vpn-setup/firewall-rtx3060.sh
```
Follow detailed guide: `05-firewall-security.md`

### 6. Verify Everything (5 min)
```bash
# From any node, check mesh connectivity
tailscale status

# Test MAP-API
curl http://dell-gb10:8000/health

# Test PostgreSQL
psql "postgresql://sim_admin@rtx3060-db:5432/movieanimation_db"

# Run full health check
bash infrastructure/azure-vpn/vpn-health-check.sh
```

---

## Architecture Overview

```
User → [HTTPS] → Azure App Service (Next.js + Tailscale)
                      │
                      ├─ /api/db/* → Tailscale SOCKS5 → rtx3060-db:5432 (PostgreSQL)
                      └─ /api/gpu/* → Tailscale SOCKS5 → dell-gb10:8000 (MAP-API)
                                                              │
                                                              └─ RTX 3060 CUDA Rendering
```

**Key Decision:** Tailscale (WireGuard mesh) over Azure VPN Gateway
- **Cost:** $0/month vs $138+/month
- **Setup:** 30 minutes vs 2-4 hours
- **Maintenance:** Near-zero vs ongoing

---

## Related Documentation

- [Full VPN Architecture](../azure-vpn-architecture.md) — 15-section comprehensive design
- [Infrastructure Architecture](../../infrastructure/azure-vpn/ARCHITECTURE.md) — Implementation details
- [Network Routing](../../infrastructure/azure-vpn/network-routing.md) — Routing configuration
- [Deployment Runbook](../DEPLOYMENT.md) — Production deployment guide
