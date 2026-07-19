# 05 — Firewall Rules & Network Security

**Estimated Time:** 10 minutes  
**Nodes:** Dell GB10 + RTX 3060

---

## Security Principle: Zero Trust for Local Nodes

Even though these are "local" servers, treat them as if they're exposed to the internet:

1. **Bind services to Tailscale IPs only** (never `0.0.0.0`)
2. **iptables default DROP inbound** (whitelist what's needed)
3. **Tailscale ACLs** as application-layer access control
4. **Internal API keys** for service-to-service auth
5. **PostgreSQL pg_hba.conf** as database-level access control

---

## Dell GB10 Firewall (iptables)

Apply: `sudo bash docs/azure-vpn-setup/firewall-gb10.sh`

### Rules Summary

| Rule | Interface | Port | Source | Purpose |
|------|-----------|------|--------|---------|
| ACCEPT | lo | * | localhost | Loopback |
| ACCEPT | * | * | ESTABLISHED | Return traffic |
| ACCEPT | * | 41641/udp | Any | WireGuard |
| ACCEPT | tailscale0 | 8000/tcp | Tailscale mesh | MAP-API |
| ACCEPT | tailscale0 | 22/tcp | Tailscale mesh | SSH |
| ACCEPT | * | * | 192.168.1.0/24 | Local LAN |
| DROP | * | * | Any | Default deny |

---

## RTX 3060 Firewall (iptables)

Apply: `sudo bash docs/azure-vpn-setup/firewall-rtx3060.sh`

### Rules Summary

| Rule | Interface | Port | Source | Purpose |
|------|-----------|------|--------|---------|
| ACCEPT | lo | * | localhost | Loopback |
| ACCEPT | * | * | ESTABLISHED | Return traffic |
| ACCEPT | * | 41641/udp | Any | WireGuard |
| ACCEPT | tailscale0 | 5432/tcp | Tailscale mesh | PostgreSQL |
| ACCEPT | tailscale0 | 22/tcp | Tailscale mesh | SSH |
| ACCEPT | * | * | 192.168.1.0/24 | Local LAN |
| DROP | * | * | Any | Default deny |

---

## Tailscale ACL Policy

Apply via: `https://login.tailscale.com/admin/acls` (paste from `tailscale-acl.json`)

### Access Control Matrix

| Source Tag | Destination Tag | Port | Protocol | Purpose |
|------------|----------------|------|----------|---------|
| `azure-frontend` | `gpu-server` | 8000 | TCP | GPU rendering API |
| `azure-frontend` | `database` | 5432 | TCP | PostgreSQL queries |
| `gpu-server` | `database` | 5432 | TCP | Internal DB access |
| `admin` | `gpu-server` | * | TCP | Admin access |
| `admin` | `database` | * | TCP | Admin access |
| `admin` | all | 22 | TCP | SSH access |

All other traffic is **DENIED** by default.

---

## Quick Deployment

```bash
# === Dell GB10 ===
ssh -p 2223 simrobotics@localhost

# Apply firewall
sudo bash /home/simrobotics/movieanimation/docs/azure-vpn-setup/firewall-gb10.sh

# Verify rules
sudo iptables -L -v -n

# Make persistent
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save

# === RTX 3060 ===
ssh -p 2222 simrobotics@localhost

# Apply firewall
sudo bash /home/simrobotics/movieanimation/docs/azure-vpn-setup/firewall-rtx3060.sh

# Verify rules
sudo iptables -L -v -n

# Make persistent
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

---

## Verification Commands

```bash
# Check listening ports (should NOT show 0.0.0.0 for sensitive services)
sudo ss -tlnp

# Dell GB10: Should show only 100.64.2.10:8000 (MAP-API)
# RTX 3060:  Should show 100.64.2.20:5432 (PostgreSQL), NOT 0.0.0.0:5432

# Check firewall rules
sudo iptables -L INPUT -v -n --line-numbers

# Check Tailscale ACLs are active
tailscale status  # Look for "offline" nodes (ACL blocked nodes may appear offline)
```

---

## Security Audit Checklist

Run these after deployment:

- [ ] PostgreSQL NOT listening on `0.0.0.0` or `*`
  ```bash
  sudo ss -tlnp | grep 5432
  ```
- [ ] MAP-API NOT listening on `0.0.0.0`
  ```bash
  sudo ss -tlnp | grep 8000
  ```
- [ ] No SSH exposed on public interface
  ```bash
  sudo ss -tlnp | grep :22  # Should show only tailscale0 or LAN IP
  ```
- [ ] iptables has default DROP policy
  ```bash
  sudo iptables -L INPUT | head -1  # Should show "DROP"
  ```
- [ ] Tailscale ACLs deny unauthorized traffic
  ```bash
  # From an unauthorized node, try:
  curl http://dell-gb10:8000/health  # Should be rejected
  ```
- [ ] Internal API key required for MAP-API
  ```bash
  curl http://dell-gb10:8000/api/v1/video/status/test  # Should return 403
  ```
- [ ] PostgreSQL rejects unlisted IPs
  ```bash
  # From external network (not on VPN), try connecting — should fail
  ```

---

**Next:** Monitoring setup → `06-monitoring.md`
