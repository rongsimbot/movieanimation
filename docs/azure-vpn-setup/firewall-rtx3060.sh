#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# firewall-rtx3060.sh — RTX 3060 Firewall Rules
# ═══════════════════════════════════════════════════════════════
# Applies iptables rules to secure the PostgreSQL database server.
# Only allows PostgreSQL (5432) and SSH (22) via Tailscale interface.
#
# Deploy: sudo bash firewall-rtx3060.sh
# Make permanent: sudo apt-get install -y iptables-persistent
#                  sudo netfilter-persistent save
# ═══════════════════════════════════════════════════════════════

set -e

echo "🔒 Configuring firewall for RTX 3060 (PostgreSQL Database Server)..."

# ─── Flush existing rules ─────────────────────────────────────
iptables -F INPUT
iptables -F FORWARD
iptables -F OUTPUT
iptables -X 2>/dev/null || true

# ─── Default policy: DROP inbound, ACCEPT outbound ────────────
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# ─── Allow loopback ───────────────────────────────────────────
iptables -A INPUT -i lo -j ACCEPT

# ─── Allow established/related connections ────────────────────
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# ─── Allow WireGuard (Tailscale) — UDP 41641 ──────────────────
iptables -A INPUT -p udp --dport 41641 -j ACCEPT

# ─── Allow PostgreSQL on Tailscale interface only ──────────────
iptables -A INPUT -i tailscale0 -p tcp --dport 5432 -j ACCEPT

# ─── Allow PgBouncer on Tailscale interface (if used) ─────────
iptables -A INPUT -i tailscale0 -p tcp --dport 6432 -j ACCEPT

# ─── Allow SSH on Tailscale interface only ─────────────────────
iptables -A INPUT -i tailscale0 -p tcp --dport 22 -j ACCEPT

# ─── Allow all traffic from local LAN ──────────────────────────
iptables -A INPUT -s 192.168.1.0/24 -j ACCEPT

# ─── Allow ICMP (ping) for diagnostics ────────────────────────
iptables -A INPUT -p icmp --icmp-type echo-request -j ACCEPT

# ─── Log and drop everything else ─────────────────────────────
iptables -A INPUT -m limit --limit 5/min -j LOG \
  --log-prefix "FIREWALL-DROP-RTX3060: " --log-level 4
iptables -A INPUT -j DROP

# ─── Save rules ───────────────────────────────────────────────
if command -v iptables-save &>/dev/null; then
  mkdir -p /etc/iptables
  iptables-save > /etc/iptables/rules.v4
  echo "   Rules saved to /etc/iptables/rules.v4"
fi

# ─── Summary ──────────────────────────────────────────────────
echo ""
echo "✅ Firewall configured for RTX 3060:"
echo ""
iptables -L INPUT -v -n --line-numbers 2>/dev/null | grep -E "^(Chain|num|ACCEPT|DROP|LOG)" || iptables -L INPUT -v --line-numbers
echo ""
echo "Active listening services:"
ss -tlnp 2>/dev/null | grep -E "5432|6432|22|41641" || echo "   (ss not available, check manually)"
echo ""
echo "⚠️  IMPORTANT: Verify PostgreSQL is NOT listening on 0.0.0.0:"
ss -tlnp 2>/dev/null | grep ":5432" || echo "   (ss not available, check manually)"
echo ""
echo "⚠️  To make rules permanent:"
echo "   sudo apt-get install -y iptables-persistent"
echo "   sudo netfilter-persistent save"
