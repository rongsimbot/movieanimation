# Network Security Rules
## MovieAnimation.ai — Hybrid-Cloud Firewall Configuration

---

## Security Model

The network employs a **defense-in-depth** strategy with four layers:

```
Layer 1: Azure NSG (Network Security Group) — controls Azure VNet traffic
Layer 2: Tailscale ACL — controls VPN-level access
Layer 3: UFW (Uncomplicated Firewall) — controls LoServer host access
Layer 4: Application Auth — JWT tokens, API rate limiting
```

---

## Layer 1: Azure Network Security Group

### Inbound Rules (Internet → Azure)

| Priority | Name | Port | Protocol | Source | Destination | Action |
|----------|------|------|----------|--------|-------------|--------|
| 100 | AllowHTTPS | 443 | TCP | Internet | App Service | Allow |
| 110 | AllowHTTP | 80 | TCP | Internet | App Service | Allow |
| 200 | AllowVPN | 500,4500 | UDP | SimRobotics Public IP | VPN Gateway | Allow |
| 1000 | DenyAll | * | * | Internet | VirtualNetwork | Deny |

### Azure NSG CLI Setup
```bash
# Create NSG
az network nsg create \
  --resource-group movieanimation-rg \
  --name movieanimation-nsg

# Inbound: Allow HTTPS
az network nsg rule create \
  --resource-group movieanimation-rg \
  --nsg-name movieanimation-nsg \
  --name AllowHTTPS \
  --priority 100 \
  --direction Inbound \
  --source-address-prefixes Internet \
  --destination-port-ranges 443 \
  --protocol Tcp \
  --access Allow

# Inbound: Allow HTTP (redirects to HTTPS)
az network nsg rule create \
  --resource-group movieanimation-rg \
  --nsg-name movieanimation-nsg \
  --name AllowHTTP \
  --priority 110 \
  --direction Inbound \
  --source-address-prefixes Internet \
  --destination-port-ranges 80 \
  --protocol Tcp \
  --access Allow

# Inbound: Deny everything else
az network nsg rule create \
  --resource-group movieanimation-rg \
  --nsg-name movieanimation-nsg \
  --name DenyAllInbound \
  --priority 1000 \
  --direction Inbound \
  --source-address-prefixes '*' \
  --access Deny
```

---

## Layer 2: Tailscale ACL

See `../tailscale/tailscale-acl.json` for the complete ACL configuration.

### Key Rules Summary
```
✅ Azure Frontend (tag:azure-frontend) → Backend API (tag:local-backend:3001)
✅ Azure Frontend → MAP-API (tag:local-backend:8000)
✅ Backend API → PostgreSQL (tag:local-database:5432)
✅ Backend API → Redis (tag:local-backend:6379)
✅ Admin SSH → All nodes
❌ Internet → Database (no public ports)
❌ Azure → SSH (only admins)
```

---

## Layer 3: UFW (LoServer)

```bash
# Reset UFW to defaults
sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# ─── Public Services ─────────────────────────────────
# HTTP/HTTPS (Nginx reverse proxy — ONLY if Azure frontend isn't ready)
# sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp

# ─── Tailscale VPN ───────────────────────────────────
# Allow all Tailscale traffic on the tailscale0 interface
sudo ufw allow in on tailscale0
sudo ufw allow out on tailscale0

# ─── Local Services ──────────────────────────────────
# Backend API (only accessible via Tailscale or localhost)
sudo ufw allow from 127.0.0.1 to any port 3001
sudo ufw allow from 100.64.0.0/10 to any port 3001  # Tailscale CIDR

# MAP-API (GPU rendering service — local only)
sudo ufw allow from 127.0.0.1 to any port 8000

# Redis (local only)
sudo ufw allow from 127.0.0.1 to any port 6379

# SSH (only from Tailscale and local)
sudo ufw allow from 100.64.0.0/10 to any port 22
sudo ufw allow from 127.0.0.1 to any port 22

# ─── PostgreSQL SSH Tunnel ───────────────────────────
# Allow outgoing SSH to RTX 3060
sudo ufw allow out to 127.0.0.1 port 2222

# ─── ICMP (for ping/traceroute diagnostics) ──────────
sudo ufw allow in on tailscale0 proto icmp

# ─── Enable Firewall ─────────────────────────────────
sudo ufw --force enable

# Verify
sudo ufw status verbose
```

### RTX 3060 Node (Windows Firewall via WSL2)

```powershell
# Allow PostgreSQL from WSL2 subnet
New-NetFirewallRule -DisplayName "PostgreSQL from WSL2" `
  -Direction Inbound -LocalPort 5432 -Protocol TCP `
  -RemoteAddress 172.16.0.0/12 -Action Allow

# Allow Tailscale (if installed directly on Windows)
New-NetFirewallRule -DisplayName "Tailscale VPN" `
  -Direction Inbound -InterfaceAlias "Tailscale" -Action Allow
```

---

## Layer 4: Application Security

### API Rate Limiting (already implemented in backend)
```typescript
// backend/src/middleware/rateLimiter.ts
// General: 100 requests / 15 min
// Auth: 5 requests / 15 min
// Uploads: 20 requests / 15 min
// Generation: 10 requests / 15 min
```

### JWT Authentication
```typescript
// All /api/* routes protected except:
// - /api/auth/login
// - /api/auth/register
// - /api/health
```

### CORS
```typescript
// Only accepts requests from:
// - https://movieanimation.ai (production)
// - http://localhost:3000 (development)
```

---

## Security Hardening Checklist

- [ ] **UFW enabled** on LoServer (default deny inbound)
- [ ] **Tailscale ACL** restricts Azure to ports 3001, 8000 only
- [ ] **No public IPv4** on LoServer (behind NAT)
- [ ] **SSH** only via Tailscale (port 22 not exposed to internet)
- [ ] **PostgreSQL** only via SSH tunnel (port 5432 not on public interface)
- [ ] **Redis** bound to 127.0.0.1 only (no external access)
- [ ] **SSL/TLS** terminated at Nginx (Azure handles SSL for frontend)
- [ ] **Fail2ban** installed for SSH brute-force protection
- [ ] **Automatic security updates** enabled
- [ ] **Regular port scans** to verify no unintended exposures

### Install Fail2ban
```bash
sudo apt-get install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### Enable Automatic Security Updates
```bash
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Incident Response

### If VPN Tunnel is Compromised
1. **Immediately revoke Tailscale auth key:**
   - Go to https://login.tailscale.com/admin/settings/keys
   - Click "Revoke" on the compromised key
2. **Remove compromised node:**
   - `tailscale logout` on the compromised node
3. **Rotate all API keys** in `backend/.env.production`
4. **Audit logs:** `journalctl -u tailscaled --since "1 hour ago"`
5. **Deploy new auth key** and re-run `setup.sh`

### If Backend is Flooded from VPN
1. **Identify source IP:** `sudo tcpdump -i tailscale0 -n | grep 3001`
2. **Block in Tailscale ACL** (add deny rule for specific IP)
3. **Or block in UFW:** `sudo ufw deny from 100.64.X.X to any port 3001`

---

## Security Monitoring Commands

```bash
# Check active connections
ss -tlnp

# Check UFW status
sudo ufw status verbose

# Check fail2ban
sudo fail2ban-client status sshd

# Check for unusual network activity
sudo iftop -i tailscale0

# Check auth logs
sudo tail -f /var/log/auth.log

# Check nginx access logs for suspicious patterns
sudo tail -f /var/log/nginx/access.log | grep -E " (POST|PUT|DELETE) "

# Port scan local interfaces (should show minimal ports)
ss -tlnp | grep -v 127.0.0.1
```

---

## Related Files
- `../tailscale/tailscale-acl.json` — VPN access control lists
- `../vpn-health-check.sh` — Automated security monitoring
- `../../docs/security-audit.md` — Application security audit
- `../../backend/src/middleware/rateLimiter.ts` — API rate limiting
