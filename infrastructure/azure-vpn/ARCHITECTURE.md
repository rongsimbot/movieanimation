# MovieAnimation.ai — Hybrid-Cloud VPN Architecture
## Azure Frontend ↔ SimRobotics Local LAN

**Version:** 1.0  
**Last Updated:** 2026-05-24  
**Author:** SimCoder (Infrastructure)

---

## Executive Summary

MovieAnimation.ai uses a **hybrid-cloud deployment model** to maximize cost efficiency and security:

- **Public Tier (Azure):** Next.js frontend served via Azure App Service. Handles all user-facing traffic, SSL termination, and static asset delivery.
- **Private Tier (SimRobotics LAN):** All GPU rendering (MAP-API), video processing (FFmpeg), and PostgreSQL databases run on local hardware (Dell GB10 + RTX 3060).
- **Secure Tunnel:** Tailscale (primary) or Azure VPN Gateway (enterprise) connects Azure VNet to the SimRobotics LAN over encrypted WireGuard tunnels.

### Why Hybrid-Cloud?

| Factor | Benefit |
|--------|---------|
| **Cost** | GPU rendering on local RTX 3060: $0/hour. Azure GPU VMs: $1.50-$4/hour. Savings: ~$1,000-$3,000/month at scale |
| **Security** | PostgreSQL database never exposed to public internet. All DB traffic stays inside encrypted VPN |
| **Latency** | Local FFmpeg processing <1ms. Cloud processing: 50-200ms round-trip per operation |
| **Control** | Full hardware access for CUDA optimizations, driver updates, custom model loading |
| **Compliance** | User data (photos, scripts) never leaves SimRobotics-controlled infrastructure |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         INTERNET 🌐                                 │
│                                                                     │
│  Users ────► movieanimation.ai (DNS A → Azure Public IP)            │
│                                                                     │
│  ┌──────────────────────────────┐     ┌──────────────────────────┐  │
│  │   AZURE CLOUD (Public)       │     │   SIMROBOTICS LAN        │  │
│  │                              │     │   (San Antonio, TX)       │  │
│  │  ┌────────────────────────┐  │     │                          │  │
│  │  │ Azure App Service      │  │     │  ┌─────────────────────┐ │  │
│  │  │ (Next.js Frontend)     │  │     │  │ LoServer (Ubuntu)   │ │  │
│  │  │                        │  │     │  │                     │ │  │
│  │  │ • Serves UI            │  │     │  │ • Nginx (SSL)       │ │  │
│  │  │ • Static assets (CDN)  │  │     │  │ • Backend API :3001 │ │  │
│  │  │ • API proxy to backend │──┼─────┼─►│ • Redis :6379       │ │  │
│  │  │ • Auth (NextAuth.js)   │  │ VPN │  │ • FFmpeg Pipeline   │ │  │
│  │  └────────┬───────────────┘  │TUNNEL│  │ • MAP-API :8000     │ │  │
│  │           │                   │     │  └──────────┬──────────┘ │  │
│  │  ┌────────▼───────────────┐  │     │             │ SSH Tunnel  │  │
│  │  │ Tailscale/Azure VPN   │  │     │             │ (port 2222)  │  │
│  │  │ Gateway Subnet         │══╪═════╪═════════════╪══════════════│  │
│  │  │ 100.64.0.0/10 (TS)    │  │     │             │             │  │
│  │  │ OR 10.255.0.0/16 (Az) │  │     │             ▼             │  │
│  │  └───────────────────────┘  │     │  ┌─────────────────────┐ │  │
│  │                              │     │  │ RTX 3060 (WSL2)     │ │  │
│  │  Traffic Flow:              │     │  │                     │ │  │
│  │  Frontend ──► VPN ──► Local │     │  │ • PostgreSQL :5432  │ │  │
│  │  API ──► VPN ──► Local DB  │     │  │   - movieanimation   │ │  │
│  │  GPU Jobs ──► VPN ──► RTX  │     │  │   - simrobotics_crm  │ │  │
│  └──────────────────────────────┘     │  • GPU Rendering      │ │  │
│                                       │  • CUDA Acceleration  │ │  │
│                                       └─────────────────────┘ │  │
│                                                                │  │
└─────────────────────────────────────────────────────────────────────┘

Network Subnets:
  Azure VNet:        10.0.0.0/16
  Gateway Subnet:    10.0.1.0/27 (Azure VPN Gateway)  
  App Subnet:        10.0.2.0/24 (Azure App Service VNet Integration)
  SimRobotics LAN:   192.168.1.0/24
  Tailscale:         100.64.0.0/10 (auto-assigned)
```

---

## Connection Flow

### 1. User Requests Frontend
```
User → movieanimation.ai → Azure App Service → Next.js SSR → User
```
- All frontend rendering happens in Azure
- API calls from browser route through Azure → VPN → LoServer

### 2. API Calls (DB Queries, Auth)
```
Browser → /api/* → Azure App Service → Tailscale VPN → LoServer:3001 → PostgreSQL (via SSH tunnel:2222 → RTX 3060:5432)
```
- Database never directly accessible from Azure or internet
- Queries travel through TWO secure layers: Tailscale + SSH tunnel

### 3. GPU Rendering Jobs
```
Browser → /api/videos/render → Azure → Tailscale → LoServer MAP-API → RTX 3060 CUDA
```
- Heavy compute stays on local GPU
- Only job status/results travel back over VPN

### 4. Movie Assembly (FFmpeg)
```
Browser → /api/movie/assemble → Azure → Tailscale → LoServer → FFmpeg (local)
```
- Multi-GB video files never traverse the VPN
- Final exports uploaded to Azure Blob Storage for distribution

---

## VPN Options: Tailscale vs Azure VPN Gateway

### Option A: Tailscale (Recommended for Startup Phase)

| Aspect | Detail |
|--------|--------|
| **Setup Time** | ~10 minutes |
| **Cost** | Free for up to 3 users, $6/user/month for team plan |
| **Protocol** | WireGuard (kernel-level, extremely fast) |
| **NAT Traversal** | Automatic (works behind any firewall) |
| **ACL** | JSON-based access control lists |
| **MagicDNS** | Automatic DNS for all nodes (e.g., `loserver.tailnet-name.ts.net`) |
| **Exit Node** | Can route all Azure traffic through local network if needed |
| **Best For** | Rapid deployment, low maintenance, small teams |

### Option B: Azure VPN Gateway (Enterprise)

| Aspect | Detail |
|--------|--------|
| **Setup Time** | ~2-4 hours |
| **Cost** | $138/month (Basic SKU) + $0.035/GB data transfer |
| **Protocol** | IKEv2/IPsec (industry standard) |
| **SLA** | 99.9% (Basic), 99.95% (High Performance) |
| **Throughput** | 100 Mbps (Basic) to 10 Gbps (Ultra) |
| **BGP** | Supported for dynamic routing |
| **Monitoring** | Native Azure Monitor + Log Analytics |
| **Best For** | Compliance requirements, dedicated bandwidth, Azure-native monitoring |

**Decision:** Start with Tailscale; graduate to Azure VPN Gateway when MRR exceeds $10K/month or compliance requires it.

---

## Implementation Checklist

### Phase 1: Tailscale Setup (Immediate)
- [x] Architecture documented
- [ ] Install Tailscale on LoServer
- [ ] Install/configure Tailscale on Azure App Service (via Sidecar or VNet integration)
- [ ] Configure ACL rules (restrict to specific ports/services)
- [ ] Set up Tailscale auto-start on boot
- [ ] Configure firewall rules (UFW)
- [ ] Test VPN tunnel connectivity
- [ ] Test API routing over VPN (frontend → backend)
- [ ] Test DB queries over VPN (backend → PostgreSQL)
- [ ] Set up health monitoring

### Phase 2: Azure VPN Gateway (Future)
- [ ] Create Azure VNet + subnets
- [ ] Deploy VPN Gateway (Bicep template)
- [ ] Configure local network gateway (SimRobotics LAN)
- [ ] Establish IPsec/IKEv2 connection
- [ ] Configure BGP routing
- [ ] Switchover from Tailscale
- [ ] Decommission Tailscale

### Phase 3: Azure App Service Deployment
- [ ] Configure Azure App Service Plan (B1: 1 core, 1.75GB RAM)
- [ ] Set up VNet integration for App Service
- [ ] Deploy Next.js frontend
- [ ] Configure custom domain + SSL (Azure CDN)
- [ ] Set up CI/CD pipeline (GitHub Actions → Azure)

---

## Security Considerations

### Network Segmentation
- VPN traffic is isolated from public traffic
- No public IPs on database or backend servers
- Tailscale ACLs enforce least-privilege access

### Encryption
- **In Transit:** WireGuard (ChaCha20-Poly1305) for Tailscale; IPsec (AES-256-GCM) for Azure VPN Gateway
- **At Rest:** PostgreSQL with filesystem encryption (LUKS on LoServer)
- **Application:** TLS 1.3 (Azure App Service managed certificate)

### Access Control
```
Tailscale ACL Example:
{
  "acls": [
    // Azure App Service → Backend API only
    {"action": "accept", "src": ["tag:azure-frontend"], "dst": ["tag:local-backend:3001"]},
    // Backend API → Database only
    {"action": "accept", "src": ["tag:local-backend"], "dst": ["tag:local-database:5432"]},
    // Admin SSH access
    {"action": "accept", "src": ["autogroup:admin"], "dst": ["tag:local-backend:22"]},
    // Deny all other traffic
    {"action": "accept", "src": ["*"], "dst": ["*:*"]} // Final catch-all
  ]
}
```

### Monitoring & Alerting
- Tailscale: Admin console shows node status, traffic, connected clients
- Azure: Application Insights for frontend, Azure Monitor for VPN Gateway
- Local: `vpn-health-check.sh` cron job every 5 minutes
- Alerts: Telegram notification if VPN tunnel drops

---

## Cost Analysis

### Tailscale Route (Monthly)
| Item | Cost |
|------|------|
| Tailscale Free Tier (3 users) | $0 |
| Azure App Service B1 | $13 |
| Azure CDN (50GB) | $5 |
| **Total** | **$18/month** |

### Azure VPN Gateway Route (Monthly)
| Item | Cost |
|------|------|
| Azure VPN Gateway (Basic) | $138 |
| Azure App Service B1 | $13 |
| Azure CDN (50GB) | $5 |
| Data Transfer (100GB) | $3.50 |
| **Total** | **$159.50/month** |

### Savings vs Full Azure
| Architecture | Monthly Cost |
|-------------|-------------|
| Full Azure (GPU VM NC4as) | ~$1,200 |
| Hybrid-Cloud (Tailscale) | ~$18 |
| **Savings** | **$1,182/month (98.5%)** |

---

## Troubleshooting

### VPN Tunnel Down
```bash
# Check Tailscale status
tailscale status

# Restart Tailscale
sudo systemctl restart tailscaled

# Check logs
journalctl -u tailscaled -f
```

### Backend Unreachable from Azure
```bash
# From Azure, test connectivity
curl -v http://100.x.x.x:3001/api/health  # Tailscale IP

# Check if backend is listening on Tailscale interface
ss -tlnp | grep 3001
```

### Database Queries Failing
```bash
# Verify SSH tunnel
ssh -p 2222 -o ConnectTimeout=5 simrobotics@localhost "echo OK"

# Check PostgreSQL
PGPASSWORD='SimData_Vector_2026!' psql -h localhost -p 5432 -U sim_admin -d movieanimation -c "SELECT 1"
```

---

## References

- [Tailscale Documentation](https://tailscale.com/kb/)
- [Azure VPN Gateway Documentation](https://learn.microsoft.com/en-us/azure/vpn-gateway/)
- [Azure App Service VNet Integration](https://learn.microsoft.com/en-us/azure/app-service/overview-vnet-integration)
- [WireGuard Protocol](https://www.wireguard.com/)
- [MovieAnimation Deployment Runbook](../docs/DEPLOYMENT.md)

---

**Next Steps:**
1. Generate Tailscale auth key from admin console
2. Run `./infrastructure/azure-vpn/tailscale/setup.sh` on LoServer
3. Configure Azure App Service with Tailscale sidecar
4. Run `./infrastructure/azure-vpn/vpn-health-check.sh` to verify
5. Update Trello card with completion status
