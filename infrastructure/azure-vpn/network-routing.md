# Network Routing Configuration
## MovieAnimation.ai — Azure ↔ SimRobotics LAN

---

## Overview

Routes ensure that traffic from Azure App Service correctly reaches local backend services and vice versa. The routing configuration is critical for the hybrid-cloud architecture to function.

---

## Routing Tables

### Tailscale (Current)

Tailscale handles routing automatically via its coordination server. No manual routing needed:

```
Auto-configured Routes:
  Azure Node (100.64.x.x) → SimRobotics LAN (192.168.1.0/24)
  SimRobotics LAN → Azure Node (100.64.x.x)
```

**Verify Routes:**
```bash
# On LoServer
tailscale status

# Show routes being advertised and accepted
tailscale debug routes

# Check routing table
ip route show table 52  # Tailscale uses table 52 by default
```

### Azure VPN Gateway (Future)

When migrating to Azure VPN Gateway:

#### Azure Side (Route Table)
```
Route Table: movieanimation-routes
  ┌─────────────────────┬──────────────────────┬─────────────┐
  │ Destination         │ Next Hop             │ Type        │
  ├─────────────────────┼──────────────────────┼─────────────┤
  │ 10.0.0.0/16         │ Virtual Network      │ VNet        │
  │ 192.168.1.0/24      │ VPN Gateway          │ VPN         │
  │ 0.0.0.0/0           │ Internet             │ Internet    │
  └─────────────────────┴──────────────────────┴─────────────┘
```

#### LoServer Side (Linux Routes)
```bash
# Temporary (until reboot)
sudo ip route add 10.0.0.0/16 via 100.64.0.1 dev tailscale0

# Permanent (/etc/netplan/ or /etc/network/interfaces)
# Netplan (Ubuntu 18.04+):
sudo tee /etc/netplan/60-vpn-routes.yaml << 'EOF'
network:
  version: 2
  ethernets:
    eth0:
      routes:
        - to: 10.0.0.0/16
          via: 100.64.0.1
EOF
sudo netplan apply

# Or using systemd-networkd:
sudo tee /etc/systemd/network/10-vpn-route.network << 'EOF'
[Route]
Destination=10.0.0.0/16
Gateway=100.64.0.1
EOF
```

---

## Application-Level Routing

### Azure App Service → Backend API

The frontend (Next.js) needs to know where the backend API is:

```bash
# .env.production (Azure App Service)
NEXT_PUBLIC_API_URL=http://100.64.X.X:3001/api    # Tailscale IP of LoServer
# OR
NEXT_PUBLIC_API_URL=http://192.168.1.X:3001/api    # Direct LAN IP (via VPN)
```

**Next.js API Proxy (next.config.ts):**
```typescript
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      },
    ];
  },
};
```

### Backend API → PostgreSQL Database

The backend connects to PostgreSQL via SSH tunnel (already configured):

```typescript
// backend/src/config/database.ts
const poolConfig = {
  host: process.env.DATABASE_HOST || 'localhost',   // localhost (SSH tunnel)
  port: 5432,                                        // tunneled to RTX 3060
  // ...
};
```

### Backend API → MAP-API (GPU Rendering)

For GPU rendering jobs, the backend calls the local MAP-API:

```python
# MAP-API runs on LoServer:8000
# Backend calls it locally (no VPN needed within LAN)
MAP_API_URL = 'http://localhost:8000/api/v1'
```

---

## Traffic Flow Diagrams

### Scenario 1: User Login
```
Browser → https://movieanimation.ai/api/auth/login
  │
  ▼
Azure App Service (Next.js)
  │ rewrites to...
  ▼
Tailscale VPN Tunnel
  │
  ▼
LoServer:3001 (Backend API)
  │ POST /api/auth/login
  ▼
PostgreSQL (via SSH tunnel → RTX 3060:5432)
  │ SELECT * FROM users WHERE email = ?
  ▼
Response → VPN → Azure → Browser
```

### Scenario 2: GPU Video Generation
```
Browser → /api/videos/generate
  │
  ▼
Azure → VPN → LoServer:3001
  │ Queue job in BullMQ (Redis)
  ▼
Worker picks up job → MAP-API:8000/video/render
  │
  ▼
RTX 3060 CUDA Processing
  │ Luma/Runway API call
  │ FFmpeg processing
  ▼
Result stored locally, status updated
  │ WebSocket/SSE pushes status to browser
  ▼
Browser receives progress updates
```

### Scenario 3: Movie Export Download
```
Browser → /api/exports/:id/download
  │
  ▼
Azure → VPN → LoServer:3001
  │ Read file from /data/exports
  ▼
Stream file through VPN → Azure → Browser
  │
  NOTE: For large files (>100MB), use Azure Blob Storage as intermediary:
  1. Backend uploads to Azure Blob via VPN
  2. Browser downloads direct from Azure (fast CDN, no VPN bottleneck)
```

---

## DNS Configuration

### Tailscale MagicDNS
```
Azure Node:     azure-frontend.tailXXXX.ts.net → 100.64.X.X
LoServer:       loserver.tailXXXX.ts.net → 100.64.Y.Y
RTX 3060:       rtx3060.tailXXXX.ts.net → 100.64.Z.Z (if Tailscale on Windows)
```

### Public DNS (Cloudflare/Route53)
```
Type  │ Name                 │ Value
──────┼──────────────────────┼─────────────────────────
A     │ movieanimation.ai    │ <Azure App Service IP>
CNAME │ www.movieanimation.ai│ movieanimation.ai
CNAME │ api.movieanimation.ai│ movieanimation.ai
```

**Note:** The API is NOT publicly accessible. All /api/* traffic routes through Azure App Service → VPN → local backend. There is no direct public endpoint for the API.

---

## Split Tunneling

### What It Is
Split tunneling means only traffic destined for the SimRobotics LAN goes through the VPN. All other traffic (Google, Stripe, etc.) routes directly through the internet.

### Tailscale Configuration
```bash
# Tailscale uses split tunneling by default.
# Only traffic with destination matching advertised routes goes through VPN.

# To force ALL traffic through VPN (exit node mode):
# On Azure App Service, don't enable exit node routing
# This is the DEFAULT and CORRECT behavior

# Verify split tunneling is working:
tailscale status
# Look for "offers exit node" → ensure it's NOT enabled on Azure side
```

### Why Split Tunneling?
1. **Bandwidth** — Stripe API, OpenAI, Luma API calls don't consume VPN bandwidth
2. **Latency** — Non-LAN traffic takes shortest route
3. **Cost** — No Azure data transfer charges for non-LAN traffic
4. **Resilience** — VPN failure doesn't break ALL app functionality

---

## MTU Considerations

VPN tunnels add encapsulation overhead, reducing the effective MTU:

| Tunnel Type | Overhead | Effective MTU |
|------------|----------|---------------|
| WireGuard (Tailscale) | 60 bytes | 1440 bytes |
| IPsec/IKEv2 (Azure VPN) | 80 bytes | 1420 bytes |

**Fix MSS Clamping on LoServer:**
```bash
# Ensure TCP MSS is clamped for VPN tunnel
sudo iptables -A FORWARD -p tcp --tcp-flags SYN,RST SYN \
    -j TCPMSS --clamp-mss-to-pmtu

# Verify
sudo iptables -L FORWARD -v | grep TCPMSS
```

---

## Failover & Redundancy

For high availability, configure multiple paths:

```bash
# Priority-based routing (higher metric = lower priority)
# Primary: Tailscale VPN
ip route add 10.0.0.0/16 via 100.64.0.1 dev tailscale0 metric 100

# Secondary: Direct public IP (fallback, less secure)
# ip route add 10.0.0.0/16 via AZURE_PUBLIC_IP dev eth0 metric 200
```

---

## Verification Commands

```bash
# Check all routes
ip route show

# Trace path from Azure to backend
traceroute 192.168.1.X

# Capture VPN traffic
sudo tcpdump -i tailscale0 -n port 3001

# Check Tailscale routing table
ip route show table 52

# Test end-to-end from Azure (use Cloud Shell or SSH to Azure VM)
curl -s http://100.64.X.X:3001/api/health | jq .
```

---

## Related Files
- `../tailscale/setup.sh` — Automatic Tailscale routing setup
- `../tailscale/tailscale-acl.json` — Access control lists
- `../vpn-health-check.sh` — Route verification tests
- `../../docs/DEPLOYMENT.md` — Full deployment runbook
