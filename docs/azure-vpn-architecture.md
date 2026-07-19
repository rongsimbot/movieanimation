# MovieAnimation.ai — Hybrid-Cloud Azure VPN Architecture

**Document Version:** 1.0
**Created:** 2026-05-26
**Author:** SimCoder (VPN Architecture Design)
**Project:** MovieAnimation.ai
**Trello Card:** [SimCoder] Setup Hybrid-Cloud Azure VPN Architecture

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview & Network Diagram](#2-architecture-overview--network-diagram)
3. [VPN Solution Comparison: Tailscale vs Azure VPN Gateway](#3-vpn-solution-comparison-tailscale-vs-azure-vpn-gateway)
4. [Recommendation](#4-recommendation)
5. [Detailed Implementation: Tailscale Hybrid Mesh](#5-detailed-implementation-tailscale-hybrid-mesh)
6. [GPU Rendering Request Routing](#6-gpu-rendering-request-routing)
7. [PostgreSQL Database Query Routing](#7-postgresql-database-query-routing)
8. [Security Architecture](#8-security-architecture)
9. [Cost Analysis](#9-cost-analysis)
10. [Implementation Roadmap](#10-implementation-roadmap)
11. [Configuration Templates](#11-configuration-templates)
12. [Firewall Rules & Network Security](#12-firewall-rules--network-security)
13. [Monitoring & Alerting](#13-monitoring--alerting)
14. [Disaster Recovery & Failover](#14-disaster-recovery--fallback)
15. [Risk Assessment](#15-risk-assessment)

---

## 1. Executive Summary

MovieAnimation.ai operates a **hybrid-cloud architecture** where the customer-facing frontend runs on **Microsoft Azure** (public cloud), while all heavy GPU rendering and PostgreSQL databases reside on the private **SimRobotics LAN** (Dell GB10 + RTX 3060 nodes). This document defines the secure VPN tunnel architecture that connects these two environments, ensuring:

- **All GPU rendering requests** from Azure App Service route to the local RTX 3060 / Dell GB10
- **All PostgreSQL database queries** from Azure App Service route to the local PostgreSQL instance
- **Zero public exposure** of the local database or GPU servers
- **Minimal latency** suitable for real-time API calls
- **Cost-optimized** for a startup budget

---

## 2. Architecture Overview & Network Diagram

### High-Level Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PUBLIC INTERNET                                     │
│                                                                              │
│  ┌──────────────────────────────────────┐    ┌─────────────────────────────┐ │
│  │          MICROSOFT AZURE             │    │    SIMROBOTICS LAN           │ │
│  │          (East US Region)            │    │    (San Antonio, TX)         │ │
│  │                                      │    │                              │ │
│  │  ┌────────────────────────────────┐  │    │  ┌─────────────────────────┐ │ │
│  │  │  Azure App Service             │  │    │  │  Home Router/Firewall   │ │ │
│  │  │  (movieanimation-frontend)     │  │    │  │  (NAT: Port 41641 UDP)  │ │ │
│  │  │                                │  │    │  └───────────┬─────────────┘ │ │
│  │  │  ┌──────────────────────────┐  │  │    │              │               │ │
│  │  │  │ Tailscale (userspace)    │  │  │    │  ┌───────────┴─────────────┐ │ │
│  │  │  │ TS IP: 100.64.1.10       │◄─┼──┼────┼──┤  Subnet: 192.168.1.0/24│ │ │
│  │  │  │ SOCKS5 Proxy: :1055      │  │  │    │  └───────────┬─────────────┘ │ │
│  │  │  └──────────────────────────┘  │  │    │              │               │ │
│  │  │                                │  │    │    ┌─────────┼──────────┐    │ │
│  │  │  ┌──────────────────────────┐  │  │    │    │         │          │    │ │
│  │  │  │ Backend Routes           │  │  │    │ ┌──┴──┐  ┌──┴──┐  ┌───┴──┐ │ │
│  │  │  │ /api/gpu/* → 100.64.2.10 │  │  │    │ │Dell │  │RTX  │  │Dev   │ │ │
│  │  │  │ /api/db/*  → 100.64.2.20 │  │  │    │ │GB10 │  │3060 │  │Laptop│ │ │
│  │  │  └──────────────────────────┘  │  │    │ │.10  │  │.20  │  │.50   │ │ │
│  │  └────────────────────────────────┘  │    │ └──┬──┘  └──┬──┘  └──┬───┘ │ │
│  │                                      │    │    │        │        │      │ │
│  │  ┌────────────────────────────────┐  │    │ ┌──┴────────┴────────┴────┐ │ │
│  │  │  Tailscale Subnet Router VM    │  │    │ │  Tailscale Mesh Network   │ │ │
│  │  │  (Optional - for Azure VNet)   │  │    │ │  (WireGuard Peer-to-Peer) │ │ │
│  │  │  Advertises: 10.0.0.0/16      │◄─┼────┼─┤  100.64.0.0/10 CIDR       │ │ │
│  │  └────────────────────────────────┘  │    │ └───────────────────────────┘ │ │
│  │                                      │    │                              │ │
│  │  Azure VNet: 10.0.0.0/16            │    │  ┌─────────────────────────┐ │ │
│  │  App Svc Subnet: 10.0.1.0/24        │    │  │ PostgreSQL 16            │ │ │
│  └──────────────────────────────────────┘    │  │ (movieanimation_db)      │ │ │
│                                              │  │ Listen: 192.168.1.20:5432│ │ │
│                                              │  └─────────────────────────┘ │ │
│                                              │                              │ │
│                                              │  ┌─────────────────────────┐ │ │
│                                              │  │ MAP-API (FastAPI)        │ │ │
│                                              │  │ Listen: 192.168.1.10:8000│ │ │
│                                              │  │ /api/v1/video/render-*   │ │ │
│                                              │  │ /api/v1/process/face-swap │ │ │
│                                              │  │ /api/v1/movie/assemble   │ │ │
│                                              │  └─────────────────────────┘ │ │
│                                              └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘

CONNECTION TYPES:
  ═══  WireGuard (Tailscale) encrypted tunnel — UDP port 41641
  ───  Local Ethernet (trusted LAN)
  ◄──► HTTP/HTTPS API calls over WireGuard mesh
```

### Tailscale IP Address Assignments

| Node | Hostname | Tailscale IP | Role | Physical Location |
|------|----------|-------------|------|-------------------|
| Azure App Service (Frontend) | `movieanimation-azure` | `100.64.1.10` | Frontend + API proxy | Azure East US |
| Dell GB10 (MAP-API) | `dell-gb10` | `100.64.2.10` | GPU Rendering Server | San Antonio LAN |
| RTX 3060 (Database) | `rtx3060-db` | `100.64.2.20` | PostgreSQL + Backup GPU | San Antonio LAN |
| Dev Laptop (Ronnie) | `ronnie-laptop` | `100.64.2.50` | Admin Access | San Antonio LAN |

### Data Flow Summary

```
User Browser → [HTTPS] → Azure App Service
                            │
                            ├── /api/gpu/render → Tailscale SOCKS5 → MAP-API (100.64.2.10:8000)
                            │                                          │
                            │                                          └── GPU Inference (RTX 3060)
                            │
                            └── /api/db/* → Tailscale SOCKS5 → PostgreSQL (100.64.2.20:5432)
                                                                  │
                                                                  └── movieanimation_db
```

---

## 3. VPN Solution Comparison: Tailscale vs Azure VPN Gateway

### 3.1 Tailscale (WireGuard Mesh)

| Category | Assessment |
|----------|-----------|
| **Protocol** | WireGuard — modern, minimal attack surface (4,000 lines of code) |
| **Topology** | Mesh — all nodes peer directly (P2P) where possible; DERP relay fallback |
| **Setup Complexity** | **Very Low** — install agent on each node, authenticate, done |
| **Azure App Service Support** | ✅ Userspace networking mode (SOCKS5 proxy) — no kernel TUN device needed |
| **NAT Traversal** | ✅ Built-in — works through any NAT/firewall without port forwarding |
| **Encryption** | WireGuard (ChaCha20-Poly1305, Curve25519) |
| **Access Control** | ACL-based (JSON policy) — tag-based, group-based |
| **Latency** | ~5-10ms overhead vs direct WireGuard (negligible) |
| **Cost (per month)** | $0 (Free Personal plan: 3 users, 100 devices) or $6/user/mo (Starter) |
| **Maintenance** | Near-zero — auto-updates, auto-reconnect |
| **Monitoring** | Built-in dashboard + API (node status, latency, traffic) |
| **SSH Access** | Built-in Tailscale SSH (no open port 22 needed) |
| **Split DNS** | ✅ MagicDNS — `dell-gb10` resolves to `100.64.2.10` automatically |

### 3.2 Azure VPN Gateway (Site-to-Site IPSec)

| Category | Assessment |
|----------|-----------|
| **Protocol** | IPSec/IKEv2 — mature but complex (tens of thousands of lines) |
| **Topology** | Hub-and-spoke — Azure VPN GW is the hub |
| **Setup Complexity** | **High** — requires Azure VNet, Gateway Subnet, local network gateway, connection object, + on-prem IPSec device config |
| **Azure App Service Support** | ✅ Regional VNet Integration (requires Standard+ tier) |
| **NAT Traversal** | ❌ Complex — requires specific NAT-T configuration, may need public IP |
| **Encryption** | IPSec (multiple cipher suite options, must match both sides) |
| **Latency** | 5-15ms overhead (IPSec encapsulation + Azure gateway processing) |
| **Cost (per month)** | Basic: ~$26-30/mo | VpnGw1: ~$138/mo | VpnGw2: ~$358/mo |
| **Data Transfer** | Outbound: $0.035-0.16/GB (zone-dependent) |
| **Maintenance** | High — certificate rotation, shared key management, gateway patching |
| **Monitoring** | Azure Monitor + Network Watcher (additional cost) |
| **High Availability** | Requires VpnGw1AZ+ (zone-redundant) — higher cost |
| **SLA** | 99.9% (Basic) to 99.95% (AZ SKUs) |

### 3.3 Head-to-Head Comparison

| Factor | Tailscale (Free) | Azure VPN GW (Basic) | Azure VPN GW (VpnGw1) |
|--------|-----------------|---------------------|----------------------|
| **Monthly Cost** | $0 | ~$28 | ~$138 |
| **Annual Cost** | $0 | ~$336 | ~$1,656 |
| **Bandwidth** | Wire line speed | 100 Mbps | 650 Mbps |
| **Setup Time** | ~30 minutes | ~2-4 hours | ~2-4 hours |
| **Maintenance Hours/yr** | ~2 hours | ~20 hours | ~20 hours |
| **Azure App Service Compat** | ✅ Userspace/SOCKS5 | ✅ Regional VNet Integration | ✅ Regional VNet Integration |
| **Multi-Node Support** | ✅ P2P mesh (all nodes) | ⚠️ Hub-spoke (extra tunnel config) | ⚠️ Hub-spoke |
| **Remote Admin Access** | ✅ Built-in (Tailscale SSH) | ❌ Separate solution needed | ❌ Separate solution needed |
| **3-Year TCO** | $0-216 | ~$1,008 | ~$4,968 |

---

## 4. Recommendation

### ✅ RECOMMENDED: Tailscale (Free Personal Plan) + Azure App Service Userspace Mode

**Rationale:**

1. **Cost:** $0/month vs $138+/month for Azure VPN Gateway. For a startup, this is decisive.
2. **Simplicity:** Tailscale installs in minutes. Azure VPN Gateway requires complex IPSec configuration on both ends plus ongoing maintenance.
3. **App Service Compatibility:** Tailscale's userspace networking (SOCKS5 proxy) works perfectly with Azure App Service containers — no TUN device needed. The official Tailscale docs confirm this approach.
4. **Mesh Benefits:** All nodes can communicate directly (P2P). Adding Ronnie's laptop for admin access requires zero additional config.
5. **Security:** WireGuard is the gold standard for VPN cryptography. ACLs provide fine-grained access control.
6. **Future-Proof:** If the project grows beyond 3 users, upgrade to Starter ($6/user/month) — still a fraction of Azure VPN GW cost.

### Fallback Option: Azure VPN Gateway Basic ($28/mo)

Use this only if **corporate compliance** requires Azure-native infrastructure. For MovieAnimation.ai (a startup), this is unnecessary overhead.

---

## 5. Detailed Implementation: Tailscale Hybrid Mesh

### 5.1 Architecture Pattern: Agent-to-Agent with Userspace Proxy

Azure App Service cannot run a kernel-level WireGuard interface (no `/dev/net/tun`). Tailscale solves this via **userspace networking mode**:

```
┌──────────────────────────────────────┐
│  Azure App Service (Docker)           │
│                                       │
│  ┌────────────────────────────────┐   │
│  │  Node.js/Python Backend        │   │
│  │  ├─ DB Queries  ──► SOCKS5 ───┼───┼──► Tailscale Userspace Proxy
│  │  └─ GPU API     ──► SOCKS5 ───┼───┼──► (listens on localhost:1055)
│  └────────────────────────────────┘   │
│                                       │
│  ┌────────────────────────────────┐   │
│  │  Tailscale (--tun=userspace)   │   │
│  │  Mode: Ephemeral Node          │   │
│  │  TS IP: 100.64.1.10            │   │
│  │  SOCKS5: 127.0.0.1:1055        │   │
│  │  HTTP Proxy: 127.0.0.1:1055    │   │
│  └────────────────────────────────┘   │
└──────────────────────────────────────┘
```

### 5.2 Node Configuration Summary

#### Node A: Azure App Service (Frontend + API Proxy)

- **OS:** Linux (App Service Linux Container)
- **Tailscale Mode:** Userspace networking
- **Node Type:** Ephemeral (auto-cleans on scale-out)
- **Auth:** Pre-approved ephemeral auth key
- **SOCKS5 Proxy Port:** 1055
- **Exposes:** Routes to MAP-API and PostgreSQL via proxy

#### Node B: Dell GB10 (MAP-API Server)

- **OS:** Ubuntu 22.04 (WSL2)
- **Tailscale Mode:** Kernel WireGuard (native)
- **Node Type:** Persistent
- **IP:** 192.168.1.10 (LAN), 100.64.2.10 (Tailscale)
- **Services:** FastAPI on port 8000, SSH on port 22

#### Node C: RTX 3060 (PostgreSQL + Backup GPU)

- **OS:** Ubuntu 22.04 (WSL2)
- **Tailscale Mode:** Kernel WireGuard (native)
- **Node Type:** Persistent
- **IP:** 192.168.1.20 (LAN), 100.64.2.20 (Tailscale)
- **Services:** PostgreSQL on port 5432

#### Node D: Ronnie's Laptop (Admin/Dev Access)

- **OS:** Any (Windows/macOS/Linux)
- **Tailscale Mode:** Kernel WireGuard (native)
- **Node Type:** Persistent
- **IP:** Dynamic (LAN), 100.64.2.50 (Tailscale)
- **Access:** Direct psql, SSH to GPU nodes, admin dashboard

---

## 6. GPU Rendering Request Routing

### 6.1 Request Flow

```
Step 1: User clicks "Generate Movie" on movieanimation.ai
        ↓
Step 2: Browser POSTs to https://movieanimation.ai/api/render
        ↓
Step 3: Azure App Service receives request
        - Validates JWT authentication
        - Enqueues job (Redis/Bull queue)
        - Returns 202 Accepted with job ID
        ↓
Step 4: Background worker picks up job
        - Prepares scene JSON payload
        - Resolves MAP-API endpoint via Tailscale MagicDNS:
          http://dell-gb10:8000/api/v1/video/render-scene
        - Sends request through SOCKS5 proxy (127.0.0.1:1055)
        ↓
Step 5: WireGuard tunnel encrypts and routes packet
        Azure → Tailscale DERP (if NAT blocks direct) → Dell GB10
        or
        Azure → Direct WireGuard P2P → Dell GB10
        ↓
Step 6: MAP-API (FastAPI) on Dell GB10 receives request
        - Validates internal API key
        - Routes to appropriate GPU worker
        - RTX 3060: Luma/Kling cloud API orchestration
        - RTX 3060: Local Roop/ReActor face swap
        - RTX 3060: FFmpeg stitching/assembly
        ↓
Step 7: MAP-API returns result URL or status to Azure worker
        - Worker updates job status in PostgreSQL
        - User polls GET /api/render/{jobId}/status
        ↓
Step 8: Completed video accessible via signed URL
```

### 6.2 GPU API Endpoints (MAP-API on Dell GB10)

```python
# MAP-API routes accessible over Tailscale VPN
POST   /api/v1/video/render-scene       # Render single scene via Luma/Kling
POST   /api/v1/video/render-batch       # Batch render multiple scenes
POST   /api/v1/process/face-swap        # Local GPU face swap (Roop/ReActor)
POST   /api/v1/movie/assemble           # FFmpeg stitching + audio sync
GET    /api/v1/video/status/{job_id}    # Check render job status
GET    /api/v1/video/download/{job_id}  # Download completed render
GET    /api/v1/gpu/stats                # GPU utilization/memory stats
```

### 6.3 Azure → GPU Routing Configuration

```javascript
// azure-backend/src/config/tailscale.js
// SOCKS5 agent for all outbound VPN traffic

const { SocksProxyAgent } = require('socks-proxy-agent');

const TAILSCALE_SOCKS5 = process.env.TAILSCALE_SOCKS5 || 'socks5://127.0.0.1:1055';
const MAP_API_BASE = process.env.MAP_API_BASE || 'http://dell-gb10:8000';
const DB_HOST = process.env.DB_HOST || 'rtx3060-db';

// Create proxy agent
const proxyAgent = new SocksProxyAgent(TAILSCALE_SOCKS5);

// GPU rendering: use proxy agent in HTTP client
async function renderScene(scenePayload) {
  const response = await fetch(`${MAP_API_BASE}/api/v1/video/render-scene`, {
    method: 'POST',
    agent: proxyAgent,  // Routes through Tailscale SOCKS5 → WireGuard → Dell GB10
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': process.env.MAP_API_KEY,
    },
    body: JSON.stringify(scenePayload),
  });
  return response.json();
}
```

```python
# azure-backend/src/config/tailscale.py (Python/FastAPI variant)
import httpx
import os

TAILSCALE_SOCKS5 = os.getenv("TAILSCALE_SOCKS5", "socks5://127.0.0.1:1055")
MAP_API_BASE = os.getenv("MAP_API_BASE", "http://dell-gb10:8000")

async def render_scene(scene_payload: dict):
    async with httpx.AsyncClient(proxy=TAILSCALE_SOCKS5) as client:
        response = await client.post(
            f"{MAP_API_BASE}/api/v1/video/render-scene",
            json=scene_payload,
            headers={"X-Internal-API-Key": os.getenv("MAP_API_KEY")},
            timeout=300.0,  # 5 min for GPU rendering
        )
        return response.json()
```

---

## 7. PostgreSQL Database Query Routing

### 7.1 Connection Architecture

```
Azure App Service                   Tailscale VPN                Local LAN
┌──────────────────────┐           ┌──────────┐           ┌──────────────────┐
│  Next.js Backend     │           │          │           │  RTX 3060 Node    │
│                      │           │ WireGuard│           │                  │
│  Prisma Client ──────┼──SOCKS5──►│  Tunnel  │──TCP──────►│ PostgreSQL 16    │
│  (ts-proxy)          │           │          │  :5432    │  (port 5432)     │
│                      │           │          │           │                  │
│  DATABASE_URL:       │           │          │           │  DB:             │
│  postgresql://       │           │          │           │  movieanimation  │
│  admin@rtx3060-db/   │           │          │           │                  │
│  movieanimation_db   │           │          │           │                  │
│  ?sslmode=require    │           │          │           │                  │
└──────────────────────┘           └──────────┘           └──────────────────┘
```

### 7.2 PostgreSQL Connection Configuration

**Security:** PostgreSQL listens ONLY on the local LAN interface (`192.168.1.20`), NOT on `0.0.0.0`. The only external access path is through the Tailscale tunnel.

```bash
# postgresql.conf on RTX 3060 node
listen_addresses = '192.168.1.20,100.64.2.20,localhost'
port = 5432
ssl = on
ssl_cert_file = '/etc/ssl/certs/postgres.crt'
ssl_key_file = '/etc/ssl/private/postgres.key'
```

```ini
# pg_hba.conf — access control
# TYPE  DATABASE        USER            ADDRESS                 METHOD
# Local connections (trust LAN)
local   all             all                                     scram-sha-256
host    all             all             192.168.1.0/24          scram-sha-256
# Tailscale VPN connections (secure)
host    movieanimation_db sim_admin    100.64.2.10/32          scram-sha-256
host    movieanimation_db sim_admin    100.64.2.50/32          scram-sha-256
# Reject everything else
host    all             all             0.0.0.0/0               reject
```

### 7.3 Prisma Client Configuration (Azure Side)

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

```bash
# .env on Azure App Service
DATABASE_URL="postgresql://sim_admin:${DB_PASSWORD}@rtx3060-db:5432/movieanimation_db?sslmode=require&connect_timeout=10"
TAILSCALE_SOCKS5="socks5://127.0.0.1:1055"
```

For Prisma to use the SOCKS5 proxy, use `prisma-ts-proxy` or a custom connection wrapper:

```typescript
// lib/prisma.ts — Proxy-aware Prisma client for Azure
import { PrismaClient } from '@prisma/client';
import { SocksProxyAgent } from 'socks-proxy-agent';
import pg from 'pg';

// Override pg's default socket with SOCKS5 proxy
const proxyAgent = new SocksProxyAgent(process.env.TAILSCALE_SOCKS5 || 'socks5://127.0.0.1:1055');

// Patch pg.Client to use SOCKS5
const originalConnect = pg.Client.prototype.connect;
pg.Client.prototype.connect = function(callback?: any) {
  if (this.connectionParameters?.host?.includes('rtx3060-db')) {
    (this as any).connectionStream = proxyAgent.connect;
  }
  return originalConnect.call(this, callback);
};

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});
```

### 7.4 Connection Pooling Strategy

```typescript
// Recommended pool settings for VPN tunnel
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Connection pool tuned for VPN latency (~5-15ms)
  connection: {
    pool: {
      min: 2,      // Keep 2 warm connections
      max: 10,     // Max 10 concurrent DB connections
      idleTimeoutMillis: 30000,   // Close idle after 30s
      connectionTimeoutMillis: 10000, // Fail fast if VPN is down
    },
  },
});
```

---

## 8. Security Architecture

### 8.1 Defense-in-Depth Layers

```
Layer 1: Tailscale WireGuard Encryption
  ├── ChaCha20-Poly1305 authenticated encryption
  ├── Curve25519 key exchange
  └── Perfect forward secrecy (rotating keys)

Layer 2: Tailscale ACLs (Policy as Code)
  ├── Tag-based node identity
  ├── Source/destination IP/port rules
  └── Auto-enforced on all nodes

Layer 3: Application-Level Authentication
  ├── Internal API keys (MAP-API)
  ├── JWT tokens (user sessions)
  └── Rate limiting per endpoint

Layer 4: PostgreSQL Access Control
  ├── pg_hba.conf — IP-based + user-based
  ├── SCRAM-SHA-256 password hashing
  └── SSL/TLS for all connections

Layer 5: Network Isolation
  ├── PostgreSQL bound to private interfaces only
  ├── MAP-API bound to Tailscale interface only
  └── No services exposed on 0.0.0.0
```

### 8.2 Tailscale ACL Policy

```jsonc
{
  // tailscale-policy.json — Access Control List for MovieAnimation.ai
  "tagOwners": {
    "tag:azure-frontend": ["ronnie@simrobotics.com"],
    "tag:gpu-server":      ["ronnie@simrobotics.com"],
    "tag:database":        ["ronnie@simrobotics.com"],
    "tag:admin":           ["ronnie@simrobotics.com"]
  },

  "acls": [
    // Azure App Service → GPU Server (MAP-API)
    {
      "action": "accept",
      "src":    ["tag:azure-frontend"],
      "dst":    ["tag:gpu-server:8000"],
      "proto":  "tcp"
    },
    // Azure App Service → PostgreSQL
    {
      "action": "accept",
      "src":    ["tag:azure-frontend"],
      "dst":    ["tag:database:5432"],
      "proto":  "tcp"
    },
    // Admin → All nodes (full access)
    {
      "action": "accept",
      "src":    ["tag:admin", "ronnie@simrobotics.com"],
      "dst":    ["tag:gpu-server:*", "tag:database:*", "tag:azure-frontend:*"],
      "proto":  "tcp"
    },
    // Admin SSH access
    {
      "action": "accept",
      "src":    ["tag:admin"],
      "dst":    ["tag:gpu-server:22", "tag:database:22"],
      "proto":  "tcp"
    },
    // GPU → Database (internal-only)
    {
      "action": "accept",
      "src":    ["tag:gpu-server"],
      "dst":    ["tag:database:5432"],
      "proto":  "tcp"
    }
  ],

  // Auto-approvers for specific routes
  "autoApprovers": {
    "routes": {
      "10.0.0.0/16": ["tag:azure-frontend"],
      "192.168.1.0/24": ["tag:admin"]
    }
  },

  // Default: DENY all unspecified traffic
  "defaultSrcPosture": ["reject", "reject"]
}
```

### 8.3 MAP-API Internal Authentication

```python
# MAP-API middleware — internal API key validation
from fastapi import FastAPI, HTTPException, Request
import os
import hmac
import hashlib

app = FastAPI()
INTERNAL_API_KEY = os.getenv("MAP_API_KEY")

@app.middleware("http")
async def validate_internal_key(request: Request, call_next):
    # Skip auth for health check
    if request.url.path == "/health":
        return await call_next(request)

    provided_key = request.headers.get("X-Internal-API-Key")
    if not provided_key:
        raise HTTPException(status_code=401, detail="Missing API key")

    # Constant-time comparison to prevent timing attacks
    if not hmac.compare_digest(provided_key, INTERNAL_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid API key")

    return await call_next(request)

@app.get("/health")
async def health():
    return {"status": "healthy", "node": "dell-gb10"}
```

---

## 9. Cost Analysis

### 9.1 Tailscale (Recommended)

| Item | Monthly Cost | Annual Cost | Notes |
|------|-------------|-------------|-------|
| Tailscale License | $0 | $0 | Free Personal (3 users) |
| Azure App Service | ~$13 | ~$156 | Basic B1 Linux plan |
| Local Power (GPU idle) | ~$15 | ~$180 | RTX 3060 idle power |
| **TOTAL** | **~$28/mo** | **~$336/yr** | |

With Tailscale Starter ($6/user × 3 users):
| Item | Monthly Cost | Annual Cost |
|------|-------------|-------------|
| **TOTAL (Starter)** | **~$46/mo** | **~$552/yr** |

### 9.2 Azure VPN Gateway (Alternative)

| Item | Monthly Cost | Annual Cost | Notes |
|------|-------------|-------------|-------|
| VPN Gateway (Basic) | ~$28 | ~$336 | 100 Mbps, S2S |
| Data Transfer (outbound) | ~$10 | ~$120 | Est. 100 GB/mo from Azure |
| Azure App Service | ~$13 | ~$156 | Basic B1 Linux plan |
| Local Power | ~$15 | ~$180 | RTX 3060 idle |
| **TOTAL (Basic)** | **~$66/mo** | **~$792/yr** | |

With VpnGw1:
| Item | Monthly Cost | Annual Cost |
|------|-------------|-------------|
| **TOTAL (VpnGw1)** | **~$176/mo** | **~$2,112/yr** |

### 9.3 Cost Comparison Summary

```
                 Monthly     Annual     3-Year
Tailscale Free   ~$28        ~$336      ~$1,008
Tailscale Starter ~$46       ~$552      ~$1,656
Azure Basic GW   ~$66        ~$792      ~$2,376
Azure VpnGw1     ~$176       ~$2,112    ~$6,336
```

**Savings with Tailscale Free vs VpnGw1: $1,776/year ($5,328 over 3 years)**

---

## 10. Implementation Roadmap

### Phase 1: Tailscale Network Setup (Day 1 — ~2 hours)

- [ ] **1.1** Create Tailscale account (ronnie@simrobotics.com)
- [ ] **1.2** Install Tailscale on Dell GB10:
  ```bash
  curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up --advertise-tags=tag:gpu-server
  ```
- [ ] **1.3** Install Tailscale on RTX 3060:
  ```bash
  curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up --advertise-tags=tag:database
  ```
- [ ] **1.4** Install Tailscale on Ronnie's laptop:
  ```bash
  # Windows: Download from tailscale.com/download
  # macOS: brew install tailscale
  tailscale up
  ```
- [ ] **1.5** Verify mesh connectivity:
  ```bash
  tailscale status
  ping 100.64.2.10  # Dell GB10
  ping 100.64.2.20  # RTX 3060
  ```

### Phase 2: Azure App Service Integration (Day 1-2 — ~4 hours)

- [ ] **2.1** Generate ephemeral auth key in Tailscale Admin Console
- [ ] **2.2** Create Dockerfile with Tailscale userspace:
  ```dockerfile
  FROM node:20-slim
  # Install Tailscale
  RUN curl -fsSL https://tailscale.com/install.sh | sh
  # Copy app + startup script
  COPY . /app
  WORKDIR /app
  CMD ["/app/start.sh"]
  ```
- [ ] **2.3** Create `start.sh` with Tailscale bringup:
  ```bash
  #!/bin/sh
  tailscaled --tun=userspace-networking --socks5-server=localhost:1055 &
  tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=movieanimation-azure
  # Wait for Tailscale to connect
  until tailscale status | grep -q "movieanimation-azure"; do sleep 1; done
  # Start Next.js app
  node server.js
  ```
- [ ] **2.4** Set `TAILSCALE_AUTHKEY` in Azure App Service Configuration
- [ ] **2.5** Deploy to Azure App Service and verify connectivity
- [ ] **2.6** Test SOCKS5 proxy from within container:
  ```bash
  curl --socks5 localhost:1055 http://dell-gb10:8000/health
  ```

### Phase 3: PostgreSQL Secure Configuration (Day 2 — ~2 hours)

- [ ] **3.1** Configure `postgresql.conf` to listen on Tailscale interface
- [ ] **3.2** Update `pg_hba.conf` with Tailscale IPs
- [ ] **3.3** Generate SSL certificates for PostgreSQL
- [ ] **3.4** Restart PostgreSQL and verify connection from Azure:
  ```bash
  psql "postgresql://sim_admin@rtx3060-db:5432/movieanimation_db?sslmode=require"
  ```
- [ ] **3.5** Test Prisma connectivity through SOCKS5 proxy

### Phase 4: MAP-API Hardening (Day 2 — ~2 hours)

- [ ] **4.1** Bind MAP-API to Tailscale interface only:
  ```python
  uvicorn.run(app, host="100.64.2.10", port=8000)
  ```
- [ ] **4.2** Implement internal API key middleware
- [ ] **4.3** Set up health check endpoint
- [ ] **4.4** Test full render pipeline from Azure

### Phase 5: ACL & Security Hardening (Day 2-3 — ~2 hours)

- [ ] **5.1** Apply `tailscale-policy.json` to tailnet
- [ ] **5.2** Test ACL restrictions (verify blocked traffic is rejected)
- [ ] **5.3** Enable MagicDNS for name-based addressing
- [ ] **5.4** Set up Tailscale SSH for admin access
- [ ] **5.5** Document all credentials in `.env` (never commit to git)

### Phase 6: Monitoring & Validation (Day 3 — ~1 hour)

- [ ] **6.1** Set up Tailscale admin console notifications
- [ ] **6.2** Create health check dashboard or script
- [ ] **6.3** Load test: 100 concurrent render requests
- [ ] **6.4** Validate failover (disconnect one node, verify recovery)
- [ ] **6.5** Document runbooks for common issues

---

## 11. Configuration Templates

### 11.1 Azure App Service — Dockerfile

```dockerfile
# Dockerfile — MovieAnimation.ai Frontend (Azure App Service + Tailscale)
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    iptables \
    && rm -rf /var/lib/apt/lists/*

# Install Tailscale
RUN curl -fsSL https://tailscale.com/install.sh | sh

# Set up app directory
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .

# Build Next.js
RUN npm run build

# Copy startup script
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# SSH config for App Service
COPY docker/sshd_config /etc/ssh/sshd_config

EXPOSE 8080
CMD ["/app/start.sh"]
```

### 11.2 Azure App Service — startup script

```bash
#!/bin/sh
# start.sh — Bring up Tailscale userspace, then start Next.js

set -e

echo "🚀 Starting MovieAnimation.ai frontend..."

# Start Tailscale daemon in userspace networking mode
echo "📡 Starting Tailscale (userspace mode)..."
tailscaled \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 \
  --state=/tmp/tailscale.state \
  &

# Wait for daemon to initialize
sleep 2

# Authenticate with ephemeral key
echo "🔑 Authenticating Tailscale..."
tailscale up \
  --authkey="${TAILSCALE_AUTHKEY}" \
  --hostname="movieanimation-azure" \
  --accept-routes \
  --accept-dns=false

# Wait for Tailscale to be connected
echo "⏳ Waiting for Tailscale connection..."
for i in $(seq 1 30); do
  if tailscale status 2>/dev/null | grep -q "movieanimation-azure"; then
    echo "✅ Tailscale connected!"
    break
  fi
  sleep 1
done

# Show network info
echo "🌐 Tailscale IP: $(tailscale ip -4 2>/dev/null || echo 'pending')"
tailscale status 2>/dev/null | head -5

# Verify connectivity to backend nodes
echo "🔍 Testing connectivity to backend..."
curl -s --socks5 localhost:1055 http://dell-gb10:8000/health || echo "⚠️  MAP-API not reachable yet"

# Start the Next.js server
echo "🎬 Starting Next.js server..."
exec node server.js
```

### 11.3 MAP-API — Systemd Service (Dell GB10)

```ini
# /etc/systemd/system/map-api.service
[Unit]
Description=MovieAnimation Processing API (MAP-API)
After=network.target tailscaled.service
Requires=tailscaled.service

[Service]
Type=simple
User=sim_admin
WorkingDirectory=/home/sim_admin/map-api
Environment="MAP_API_KEY=${MAP_API_KEY}"
Environment="DATABASE_URL=postgresql://sim_admin@rtx3060-db:5432/movieanimation_db"
ExecStart=/home/sim_admin/map-api/venv/bin/uvicorn app.main:app \
  --host 100.64.2.10 \
  --port 8000 \
  --workers 4 \
  --log-level info
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 11.4 MAP-API — Environment File

```bash
# /home/sim_admin/map-api/.env
# MovieAnimation Processing API — Environment Variables

# API Security
MAP_API_KEY=map-sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Database
DATABASE_URL=postgresql://sim_admin:${DB_PASSWORD}@rtx3060-db:5432/movieanimation_db

# AI API Keys (used for cloud API calls)
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LUMA_API_KEY=luma-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RUNWAY_API_KEY=key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SEEDANCE_API_KEY=sd-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# GPU Configuration
CUDA_VISIBLE_DEVICES=0
FFMPEG_THREADS=4

# Logging
LOG_LEVEL=INFO
```

### 11.5 Tailscale ACL — Full Policy

```jsonc
{
  // tailscale-policy.json
  // Apply via: tailscale set --accept-risk=lose-ssh tailscale-policy.json
  // Or via Admin Console: https://login.tailscale.com/admin/acls

  "groups": {
    "group:admins": ["ronnie@simrobotics.com"],
    "group:devs":   ["ronnie@simrobotics.com"]
  },

  "tagOwners": {
    "tag:azure-frontend": ["group:admins"],
    "tag:gpu-server":     ["group:admins"],
    "tag:database":       ["group:admins"]
  },

  "hosts": {
    "db-internal": "100.64.2.20",
    "gpu-internal": "100.64.2.10",
    "azure-internal": "100.64.1.10"
  },

  "acls": [
    // ===== Production Traffic =====

    // Azure Frontend → MAP-API (GPU rendering only)
    {
      "action": "accept",
      "src":    ["tag:azure-frontend"],
      "dst":    ["tag:gpu-server:8000"],
      "proto":  "tcp"
    },

    // Azure Frontend → PostgreSQL (database only)
    {
      "action": "accept",
      "src":    ["tag:azure-frontend"],
      "dst":    ["tag:database:5432"],
      "proto":  "tcp"
    },

    // GPU server → PostgreSQL (internal rendering lookups)
    {
      "action": "accept",
      "src":    ["tag:gpu-server"],
      "dst":    ["tag:database:5432"],
      "proto":  "tcp"
    },

    // ===== Admin Access =====

    // Admins → All production nodes (SSH + management)
    {
      "action": "accept",
      "src":    ["group:admins"],
      "dst":    ["tag:gpu-server:22", "tag:database:22", "tag:azure-frontend:*"],
      "proto":  "tcp"
    },

    // Admins → MAP-API (direct testing)
    {
      "action": "accept",
      "src":    ["group:admins"],
      "dst":    ["tag:gpu-server:8000"],
      "proto":  "tcp"
    }
  ],

  // Auto-approve subnet routes
  "autoApprovers": {
    "routes": {
      "192.168.1.0/24": ["group:admins"],
      "10.0.0.0/16":    ["tag:azure-frontend"]
    }
  },

  // SSH rules
  "ssh": [
    {
      "action": "accept",
      "src":    ["group:admins"],
      "dst":    ["tag:gpu-server", "tag:database"],
      "users":  ["sim_admin", "root"]
    }
  ],

  // Node attributes for auto-approval
  "nodeAttrs": [
    {
      "target": ["tag:azure-frontend"],
      "attr":   ["ephemeral"]
    }
  ]
}
```

---

## 12. Firewall Rules & Network Security

### 12.1 Home Router (San Antonio LAN)

```bash
# EdgeRouter / pfSense / OPNsense rules
# Only allow Tailscale WireGuard traffic (UDP 41641)

# ALLOW: WireGuard (Tailscale direct connection)
iptables -A INPUT -p udp --dport 41641 -j ACCEPT

# ALLOW: Established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# DENY: All other inbound traffic
iptables -A INPUT -j DROP
```

**UPnP Note:** Tailscale uses DERP relay servers if direct connection fails. If your router has UPnP enabled, Tailscale will auto-configure port 41641. For security, explicitly forward port 41641/UDP instead:

```
WAN:41641/UDP → 192.168.1.10 (Dell GB10)
WAN:41641/UDP → 192.168.1.20 (RTX 3060)
```

### 12.2 Dell GB10 Local Firewall (iptables)

```bash
#!/bin/bash
# firewall-gb10.sh — Dell GB10 firewall rules

# Flush existing rules
iptables -F
iptables -X

# Default policy: DROP inbound, ACCEPT outbound
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow Tailscale WireGuard (UDP 41641)
iptables -A INPUT -p udp --dport 41641 -j ACCEPT

# Allow MAP-API on Tailscale interface only
iptables -A INPUT -i tailscale0 -p tcp --dport 8000 -j ACCEPT

# Allow SSH on Tailscale interface only (Tailscale SSH also works)
iptables -A INPUT -i tailscale0 -p tcp --dport 22 -j ACCEPT

# Allow local LAN access
iptables -A INPUT -s 192.168.1.0/24 -j ACCEPT

# Log and drop everything else
iptables -A INPUT -j LOG --log-prefix "FIREWALL-DROP: "
iptables -A INPUT -j DROP

# Save rules
iptables-save > /etc/iptables/rules.v4
```

### 12.3 RTX 3060 Local Firewall (iptables)

```bash
#!/bin/bash
# firewall-rtx3060.sh — RTX 3060 firewall rules

iptables -F
iptables -X

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

iptables -A INPUT -i lo -j ACCEPT
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Tailscale WireGuard
iptables -A INPUT -p udp --dport 41641 -j ACCEPT

# PostgreSQL — Tailscale interface ONLY
iptables -A INPUT -i tailscale0 -p tcp --dport 5432 -j ACCEPT

# SSH — Tailscale interface ONLY
iptables -A INPUT -i tailscale0 -p tcp --dport 22 -j ACCEPT

# Local LAN
iptables -A INPUT -s 192.168.1.0/24 -j ACCEPT

iptables -A INPUT -j LOG --log-prefix "FIREWALL-DROP: "
iptables -A INPUT -j DROP

iptables-save > /etc/iptables/rules.v4
```

### 12.4 PostgreSQL pg_hba.conf (Complete)

```ini
# PostgreSQL Client Authentication Configuration
# /etc/postgresql/16/main/pg_hba.conf

# TYPE  DATABASE            USER            ADDRESS                 METHOD

# Local Unix socket
local   all                 all                                     scram-sha-256

# Local LAN (trusted internal network)
host    all                 all             192.168.1.0/24          scram-sha-256

# Azure App Service via Tailscale
host    movieanimation_db   sim_admin       100.64.1.10/32          scram-sha-256
host    movieanimation_db   app_readonly    100.64.1.10/32          scram-sha-256

# Admin laptop via Tailscale
host    all                 sim_admin       100.64.2.50/32          scram-sha-256

# Dell GB10 (MAP-API) via Tailscale
host    movieanimation_db   sim_admin       100.64.2.10/32          scram-sha-256

# Dell GB10 (MAP-API) via local LAN
host    movieanimation_db   sim_admin       192.168.1.10/32         scram-sha-256

# Replication (if needed)
host    replication         replicator      192.168.1.0/24          scram-sha-256

# DENY everything else
host    all                 all             0.0.0.0/0               reject
```

---

## 13. Monitoring & Alerting

### 13.1 Health Check Endpoints

| Service | Endpoint | Expected Response | Check Interval |
|---------|----------|------------------|----------------|
| MAP-API | `GET http://dell-gb10:8000/health` | `{"status": "healthy"}` | 30s |
| PostgreSQL | TCP connect to `rtx3060-db:5432` | Connection established | 30s |
| Tailscale Mesh | `tailscale status` | All nodes "active" | 60s |
| Azure Frontend | `GET https://movieanimation.ai/api/health` | `{"status": "ok", "db": true, "gpu": true}` | 30s |

### 13.2 Azure App Service Health Probe

```typescript
// app/api/health/route.ts — Next.js health check endpoint
import { NextResponse } from 'next/server';

export async function GET() {
  const checks: Record<string, boolean> = {
    app: true,
  };

  // Check PostgreSQL via Tailscale
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch (e) {
    checks.db = false;
  }

  // Check MAP-API via Tailscale
  try {
    const proxyAgent = /* SOCKS5 agent */;
    const res = await fetch('http://dell-gb10:8000/health', { agent: proxyAgent });
    checks.gpu = res.ok;
  } catch (e) {
    checks.gpu = false;
  }

  const allHealthy = Object.values(checks).every(Boolean);
  return NextResponse.json(
    { status: allHealthy ? 'ok' : 'degraded', ...checks },
    { status: allHealthy ? 200 : 503 }
  );
}
```

### 13.3 Simple Monitor Script (Run on Dell GB10 or Cron)

```bash
#!/bin/bash
# monitor-vpn.sh — Tailscale health monitor
# Run via cron: */5 * * * * /usr/local/bin/monitor-vpn.sh

LOG_FILE="/var/log/tailscale-monitor.log"

# Check Tailscale status
if ! tailscale status > /dev/null 2>&1; then
  echo "[$(date)] ❌ Tailscale is DOWN!" >> "$LOG_FILE"
  systemctl restart tailscaled
  exit 1
fi

# Check if Azure node is reachable
if ! tailscale ping -c 1 movieanimation-azure > /dev/null 2>&1; then
  echo "[$(date)] ⚠️  Azure node unreachable" >> "$LOG_FILE"
fi

# Check if DB node is reachable
if ! tailscale ping -c 1 rtx3060-db > /dev/null 2>&1; then
  echo "[$(date)] ❌ RTX 3060 unreachable!" >> "$LOG_FILE"
fi

# Check MAP-API
if ! curl -s --max-time 5 http://localhost:8000/health > /dev/null 2>&1; then
  echo "[$(date)] ❌ MAP-API is DOWN!" >> "$LOG_FILE"
  systemctl restart map-api
fi

echo "[$(date)] ✅ All checks passed" >> "$LOG_FILE" 2>/dev/null
```

---

## 14. Disaster Recovery & Failover

### 14.1 Scenario Matrix

| Scenario | Impact | Recovery Steps | RTO |
|----------|--------|---------------|-----|
| **Tailscale control plane outage** | Nodes remain connected via existing WireGuard tunnels but cannot add new nodes | Wait for Tailscale recovery (typically <1hr) | <1hr |
| **DERP relay degraded** | Traffic routes through remaining DERP servers automatically | Automatic failover | <30s |
| **Dell GB10 down** | GPU rendering fails | Restart MAP-API service. Fallback: direct cloud API calls from Azure | <5min |
| **RTX 3060 down** | Database unavailable | Restart PostgreSQL. Azure caches recent data | <5min |
| **Home internet outage** | All local nodes unreachable | Azure serves static frontend; queue rendering jobs for when connection restores | ISP-dependent |
| **Azure region outage** | Frontend unavailable | Deploy to secondary Azure region; DNS failover | <30min |
| **Auth key expires** | Azure node cannot rejoin tailnet | Rotate key in Tailscale admin; update Azure config | <5min |

### 14.2 Fallback: Direct Cloud API Mode

If the VPN tunnel or local GPU nodes are completely unavailable, Azure can fall back to calling AI APIs directly (bypassing MAP-API), at higher cost:

```typescript
// azure-backend/src/services/gpu-router.ts
async function renderScene(payload: ScenePayload) {
  try {
    // Try local GPU via Tailscale
    return await renderViaLocalGPU(payload);
  } catch (error) {
    console.warn('⚠️  Local GPU unreachable, falling back to direct cloud APIs');
    // Fallback: call Luma/Kling directly from Azure
    return await renderViaCloudAPI(payload);
  }
}
```

---

## 15. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| Home internet outage blocks all rendering | High | Low-Medium | Fallback to direct cloud APIs; queue-and-retry system |
| Tailscale goes out of business / service shutdown | Medium | Very Low | WireGuard configs can be exported; migrate to Headscale (self-hosted) |
| DERP relay adds latency to EU/APAC users | Medium | Medium | Deploy in Azure region closest to users; DERP relays in multiple regions |
| Ephemeral key exposure | High | Low | Rotate keys monthly; restrict key to tag:azure-frontend only |
| PostgreSQL connection exhaustion over VPN | Medium | Low | Connection pooling (PgBouncer); max 10 connections from Azure |
| Latency spikes (>50ms) degrade UX | Low | Low-Medium | Queue async processing; users see status updates, not real-time rendering |
| Compliance (SOC2/GDPR) requires audit trail | Medium | Future | Tailscale Enterprise provides audit logging; Tailscale SSH session recording |

---

## Appendix A: Quick Reference Commands

```bash
# Tailscale
tailscale status                          # Show all nodes and status
tailscale ping <hostname>                 # Test connectivity to node
tailscale ip -4                           # Show own Tailscale IP
tailscale up --reset                      # Re-authenticate node
tailscale logout                          # Remove node from tailnet

# PostgreSQL (on RTX 3060)
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"  # Active connections
sudo systemctl status postgresql          # Check database status
sudo tail -f /var/log/postgresql/postgresql-16-main.log    # Database logs

# MAP-API (on Dell GB10)
sudo systemctl status map-api             # Check API status
sudo journalctl -u map-api -f             # Follow API logs
curl http://localhost:8000/health         # Health check

# WireGuard diagnostics
sudo wg show                              # Show WireGuard interfaces
tailscale bugreport                       # Generate diagnostic report
```

## Appendix B: Troubleshooting Flowchart

```
Can't connect Azure → PostgreSQL?
├── Is Tailscale running on Azure?
│   └── Check: curl --socks5 localhost:1055 http://rtx3060-db:5432
│       (Should get "empty reply" = port reachable)
├── Is Tailscale running on RTX 3060?
│   └── SSH via Tailscale: tailscale ssh rtx3060-db
├── Is PostgreSQL listening on Tailscale IP?
│   └── On RTX 3060: ss -tlnp | grep 5432
│       Should show 100.64.2.20:5432
├── Are ACLs blocking traffic?
│   └── Check Tailscale Admin Console → Access Controls
└── Is pg_hba.conf allowing the connection?
    └── Check /etc/postgresql/16/main/pg_hba.conf
        Should have: host movieanimation_db sim_admin 100.64.1.10/32 scram-sha-256

Can't reach MAP-API from Azure?
├── Is MAP-API service running?
│   └── On Dell GB10: systemctl status map-api
├── Is MAP-API bound to Tailscale IP?
│   └── ss -tlnp | grep 8000 → should show 100.64.2.10:8000
├── Is the internal API key correct?
│   └── Check X-Internal-API-Key header matches
└── Is firewall blocking port 8000 on tailscale0?
    └── iptables -L -v -n | grep 8000
```

---

**Document Status:** ✅ COMPLETE
**Next Steps:** Proceed to Phase 1 implementation (Tailscale account creation and node setup)
**Review By:** Ronnie (CEO, SimRobotics Corp)
