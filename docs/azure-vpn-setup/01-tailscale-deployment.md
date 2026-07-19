# 01 — Tailscale VPN Deployment

**Estimated Time:** 30 minutes  
**Skill Level:** Intermediate (requires sudo)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              TAILSCALE MESH NETWORK                      │
│              CIDR: 100.64.0.0/10                         │
│                                                          │
│  ┌──────────────────────┐    ┌────────────────────────┐ │
│  │ Azure App Service    │    │ SimRobotics LAN         │ │
│  │ (Ephemeral Node)     │    │                         │ │
│  │ 100.64.1.10          │    │ ┌─────────────────────┐ │ │
│  │ tag:azure-frontend   │    │ │ Dell GB10            │ │ │
│  └──────────────────────┘    │ │ 100.64.2.10          │ │ │
│                               │ │ tag:gpu-server       │ │ │
│                               │ └─────────────────────┘ │ │
│                               │                         │ │
│                               │ ┌─────────────────────┐ │ │
│                               │ │ RTX 3060             │ │ │
│                               │ │ 100.64.2.20          │ │ │
│                               │ │ tag:database         │ │ │
│                               │ └─────────────────────┘ │ │
│                               │                         │ │
│                               │ ┌─────────────────────┐ │ │
│                               │ │ Ronnie's Laptop      │ │ │
│                               │ │ 100.64.2.50          │ │ │
│                               │ │ (Admin)              │ │ │
│                               │ └─────────────────────┘ │ │
│                               └────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Step 1: Create Tailscale Account & Auth Key

### 1.1 Sign Up
- Go to https://login.tailscale.com/start
- Sign in with `ronnie@simrobotics.com` (Google/GitHub/Microsoft)
- Free plan: 3 users, 100 devices, MagicDNS, ACLs

### 1.2 Enable MagicDNS
- Admin Console → DNS → Enable MagicDNS
- This gives you: `dell-gb10.tailXXXX.ts.net` → `100.64.2.10`

### 1.3 Generate Auth Keys

#### Persistent Key (for local nodes)
- Admin Console → Settings → Keys → Generate auth key
- Description: `Local Nodes (Dell GB10 + RTX 3060)`
- Leave "Reusable" unchecked (one-time use per node)
- Leave "Ephemeral" unchecked (persistent nodes)
- Tags: `tag:gpu-server,tag:database`
- Copy key: `tskey-auth-kXXXX...`

#### Ephemeral Key (for Azure)
- Generate another key
- Description: `Azure App Service (Frontend)`
- Check "Ephemeral" (auto-removes on disconnect)
- Tag: `tag:azure-frontend`
- Copy key: `tskey-auth-kYYYY...`

> **⚠️ Security:** Ephemeral keys auto-expire when the Azure container stops. This is intentional — scale-to-zero safe.

---

## Step 2: Install Tailscale on Dell GB10 (MAP-API)

```bash
# SSH into Dell GB10
ssh -p 2223 simrobotics@localhost

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate (use persistent key from Step 1.3)
sudo tailscale up \
  --authkey="tskey-auth-kXXXX..." \
  --hostname="dell-gb10" \
  --advertise-tags="tag:gpu-server" \
  --accept-routes \
  --accept-dns \
  --ssh

# Verify
tailscale ip -4        # Should show 100.64.2.10
tailscale status       # Should show dell-gb10 as active

# Enable auto-start
sudo systemctl enable tailscaled
sudo systemctl status tailscaled
```

### Verify Dell GB10 Connectivity
```bash
# From the Dell GB10, test MagicDNS
tailscale ping rtx3060-db     # (After RTX 3060 is set up)
tailscale status               # Check all peers
```

---

## Step 3: Install Tailscale on RTX 3060 (PostgreSQL)

```bash
# SSH into RTX 3060
ssh -p 2222 simrobotics@localhost

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate
sudo tailscale up \
  --authkey="tskey-auth-kZZZZ..." \
  --hostname="rtx3060-db" \
  --advertise-tags="tag:database" \
  --accept-routes \
  --accept-dns \
  --ssh

# Verify
tailscale ip -4        # Should show 100.64.2.20
tailscale status       # Should show rtx3060-db as active

# Test cross-node connectivity
tailscale ping dell-gb10

# Enable auto-start
sudo systemctl enable tailscaled
```

---

## Step 4: Install Tailscale on Ronnie's Laptop

### Windows
1. Download from https://tailscale.com/download/windows
2. Install and sign in with `ronnie@simrobotics.com`
3. Run: `tailscale up --hostname=ronnie-laptop`

### macOS
```bash
brew install tailscale
sudo tailscale up --hostname=ronnie-laptop
```

### Linux
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=ronnie-laptop --ssh
```

---

## Step 5: Verify Mesh Connectivity

```bash
# From any node, check all peers
tailscale status

# Expected output:
# 100.64.1.10   movieanimation-azure  tag:azure-frontend  active; direct TX:41641
# 100.64.2.10   dell-gb10             tag:gpu-server      active; direct TX:41641
# 100.64.2.20   rtx3060-db            tag:database        active; direct TX:41641
# 100.64.2.50   ronnie-laptop         -                   active; direct TX:41641

# Ping tests
tailscale ping dell-gb10        # Should be <5ms on LAN
tailscale ping rtx3060-db       # Should be <5ms on LAN

# From the laptop (once Azure is set up):
tailscale ping movieanimation-azure   # Should be 30-50ms (San Antonio → East US)
```

---

## Step 6: Apply Tailscale ACL Policy

The ACL policy restricts traffic to only what's needed:

```bash
# Download the ACL JSON to your laptop
# File location: docs/azure-vpn-setup/tailscale-acl.json

# Apply via Admin Console:
# 1. Go to https://login.tailscale.com/admin/acls
# 2. Paste the contents of tailscale-acl.json
# 3. Click "Save"

# Or apply via CLI (requires Tailscale v1.40+):
tailscale set --accept-risk=lose-ssh --override-acl=tailscale-acl.json
```

### ACL Policy Summary
| Source | Destination | Port | Purpose |
|--------|-------------|------|---------|
| `tag:azure-frontend` | `tag:gpu-server` | 8000 | GPU rendering API |
| `tag:azure-frontend` | `tag:database` | 5432 | PostgreSQL queries |
| `tag:gpu-server` | `tag:database` | 5432 | Internal DB access |
| `group:admins` | All nodes | 22, 8000 | Admin SSH + debug |

---

## Step 7: Test Before Azure Deployment

```bash
# From Dell GB10, verify MAP-API is reachable via Tailscale IP
curl http://100.64.2.10:8000/health
# Expected: {"status": "healthy", "node": "dell-gb10"}

# From RTX 3060, verify PostgreSQL listens on Tailscale IP
ss -tlnp | grep 5432
# Expected: LISTEN 100.64.2.20:5432

# From Ronnie's laptop, test DB connection
psql "postgresql://sim_admin@rtx3060-db:5432/movieanimation_db?sslmode=require"
# Should connect successfully
```

---

## Upgrading Tailscale

```bash
# Auto-update (default, runs via apt)
sudo apt update && sudo apt upgrade tailscale

# Or manual update
curl -fsSL https://tailscale.com/install.sh | sh
```

## Uninstalling Tailscale

```bash
sudo tailscale logout           # Remove node from tailnet
sudo apt purge tailscale        # Uninstall
sudo rm -rf /var/lib/tailscale  # Clean state
```

---

## Troubleshooting

### Node shows as "offline"
```bash
sudo systemctl restart tailscaled
tailscale status
```

### "failed to fetch auth key"
- Auth key may have been used already (one-time use)
- Generate a new key from Admin Console

### Can't ping between nodes on same LAN
- Check Tailscale status: `tailscale status`
- Look for "direct" vs "relay" — relay means DERP, direct is preferred
- Ensure UDP 41641 is not blocked by firewall

### High latency between nodes
- If showing "relay" instead of "direct", check firewall/NAT
- Tailscale auto-falls back to DERP relays if direct P2P fails

---

**Next:** Configure Azure App Service with Tailscale → `02-azure-appservice.md`
