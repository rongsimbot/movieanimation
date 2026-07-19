# Prerequisites — Azure VPN Setup for MovieAnimation.ai

## Accounts & Access

### Required Accounts
- [ ] **Tailscale Account** — Sign up at https://tailscale.com (free tier: 3 users, 100 devices)
  - Use `ronnie@simrobotics.com` as admin email
  - Enable MagicDNS in Admin Console
  - Generate Auth Key for ephemeral Azure node: Admin Console → Settings → Keys → Generate auth key
    - Check: "Ephemeral" (auto-removes node on disconnect)
    - Tag: `tag:azure-frontend`

- [ ] **Azure Subscription** — Pay-As-You-Go or MSDN
  - Resource group: `movieanimation-rg`
  - Region: East US (or nearest to San Antonio, TX)
  - Required services: App Service (Basic B1), Container Registry (Basic)

- [ ] **Azure CLI** installed locally
  ```bash
  curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
  az login
  ```

### SSH Access
- [ ] **Dell GB10** (MAP-API GPU Server)
  - Host: `simrobotics@localhost` port 2223 (WSL2)
  - Must have sudo access
  - Must have internet access for Tailscale installation

- [ ] **RTX 3060** (PostgreSQL Database Server)
  - Host: `simrobotics@localhost` port 2222 (WSL2)
  - Must have sudo access
  - Must have internet access for Tailscale installation

- [ ] **Ronnie's Laptop** (Admin/Dev Access)
  - Install Tailscale client from https://tailscale.com/download

## Network Prerequisites

### Home Router (San Antonio LAN)
- [ ] **UDP Port 41641** forwarded to Dell GB10 (192.168.1.10) — for WireGuard direct connections
- [ ] **UDP Port 41641** forwarded to RTX 3060 (192.168.1.20) — fallback if Dell GB10 is unavailable
- [ ] UPnP enabled (optional, Tailscale can auto-configure) OR manual port forwarding

### LAN Subnet
- [ ] Subnet: `192.168.1.0/24`
- [ ] Dell GB10 static IP: `192.168.1.10`
- [ ] RTX 3060 static IP: `192.168.1.20` (or DHCP reservation)
- [ ] No conflicting VPN services (OpenVPN, StrongSwan) on ports 41641/51820

### Firewall Considerations
- [ ] ISP not blocking UDP port 41641 (common for residential ISPs)
  - Test: `nc -u -z portquiz.net 41641` (should succeed)
- [ ] Corporate/firewall proxy not interfering with WireGuard

## Software Prerequisites

### Dell GB10 (MAP-API Server)
- [ ] Ubuntu 22.04 (WSL2)
- [ ] curl, ca-certificates installed
- [ ] systemd operational (for tailscaled service)
- [ ] iptables or ufw available
- [ ] Python 3.10+ (for MAP-API)
- [ ] FastAPI + uvicorn installed

### RTX 3060 (PostgreSQL)
- [ ] Ubuntu 22.04 (WSL2)
- [ ] PostgreSQL 16 installed and running
- [ ] SSL certificates for PostgreSQL (or generate during setup)
- [ ] curl, ca-certificates installed

### Azure App Service
- [ ] App Service Plan: Linux, Basic B1 (1 core, 1.75 GB RAM)
- [ ] Container Registry: Azure Container Registry (Basic) or Docker Hub
- [ ] Custom domain: `movieanimation.ai` (optional, can use `*.azurewebsites.net`)

## Security Prerequisites

### Certificates & Keys
- [ ] **Tailscale Auth Key** (ephemeral, tag: azure-frontend) — set as `TAILSCALE_AUTHKEY` in Azure
- [ ] **MAP-API Internal Key** — 32-char random string for internal API auth
  ```bash
  openssl rand -hex 16  # Generate
  # Save to .env on Dell GB10: MAP_API_KEY=...
  # Save to Azure App Config: MAP_API_KEY=...
  ```
- [ ] **PostgreSQL SSL Certificate** (self-signed or Let's Encrypt)
- [ ] **JWT Secret** (already configured for the app)

### DNS
- [ ] MagicDNS enabled in Tailscale Admin Console
- [ ] Tailscale hostnames resolve correctly:
  - `dell-gb10` → `100.64.2.10`
  - `rtx3060-db` → `100.64.2.20`

## Cost Estimate

| Item | Monthly |
|------|---------|
| Tailscale | $0 (Free tier) |
| Azure App Service B1 | ~$13 |
| Azure Container Registry Basic | ~$5 |
| **Total** | **~$18/month** |

---

## Pre-Flight Verification Checklist

Run these BEFORE starting setup:

```bash
# 1. Verify SSH to Dell GB10
ssh -p 2223 simrobotics@localhost "echo OK" && echo "✅ Dell GB10 reachable" || echo "❌ Cannot reach Dell GB10"

# 2. Verify SSH to RTX 3060
ssh -p 2222 simrobotics@localhost "echo OK" && echo "✅ RTX 3060 reachable" || echo "❌ Cannot reach RTX 3060"

# 3. Verify PostgreSQL is running
ssh -p 2222 simrobotics@localhost "pg_isready" && echo "✅ PostgreSQL running" || echo "❌ PostgreSQL down"

# 4. Verify Docker is available (for Azure deployment)
docker --version && echo "✅ Docker available" || echo "⚠️  Docker not installed"

# 5. Verify Azure CLI
az --version && echo "✅ Azure CLI available" || echo "⚠️  Azure CLI not installed"

# 6. Verify internet on local nodes
ssh -p 2223 simrobotics@localhost "curl -sI https://tailscale.com | head -1" && echo "✅ Internet OK on Dell GB10" || echo "❌ No internet on Dell GB10"
ssh -p 2222 simrobotics@localhost "curl -sI https://tailscale.com | head -1" && echo "✅ Internet OK on RTX 3060" || echo "❌ No internet on RTX 3060"
```

---

**Next:** Proceed to `01-tailscale-deployment.md` for VPN setup.
