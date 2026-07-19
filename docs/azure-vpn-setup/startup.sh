#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# startup.sh — Azure App Service Tailscale + Next.js Entrypoint
# ═══════════════════════════════════════════════════════════════
# 1. Start Tailscale daemon in userspace networking mode
# 2. Authenticate with ephemeral auth key
# 3. Wait for Tailscale to connect
# 4. Start Next.js server on port 8080
# ═══════════════════════════════════════════════════════════════

set -e

echo "🚀 MovieAnimation.ai — Azure App Service Starting..."
echo "   $(date -u)"

# ─── Verify Required Variables ───────────────────────────────
if [ -z "${TAILSCALE_AUTHKEY}" ]; then
  echo "❌ FATAL: TAILSCALE_AUTHKEY environment variable is required."
  echo "   Set it in Azure App Service Configuration → Application Settings."
  exit 1
fi

# ─── Step 1: Start Tailscale Daemon (Userspace Mode) ─────────
echo "📡 Starting Tailscale daemon (userspace networking mode)..."
tailscaled \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 \
  --http-proxy-server=localhost:1055 \
  --state=/tmp/tailscale.state \
  --socket=/tmp/tailscaled.sock \
  &

TAILSCALED_PID=$!

# Wait for daemon socket
echo "⏳ Waiting for Tailscale daemon..."
for i in $(seq 1 20); do
  if [ -S /tmp/tailscaled.sock ]; then
    echo "   Daemon ready (pid ${TAILSCALED_PID})"
    break
  fi
  sleep 1
done

if [ ! -S /tmp/tailscaled.sock ]; then
  echo "❌ Tailscale daemon failed to start within 20s"
  exit 1
fi

# ─── Step 2: Authenticate with Tailscale ─────────────────────
echo "🔑 Authenticating Tailscale (ephemeral node)..."
tailscale --socket=/tmp/tailscaled.sock up \
  --authkey="${TAILSCALE_AUTHKEY}" \
  --hostname="movieanimation-azure" \
  --accept-routes \
  --accept-dns=false

if [ $? -ne 0 ]; then
  echo "❌ Tailscale authentication failed."
  echo "   Check TAILSCALE_AUTHKEY validity in Tailscale Admin Console."
  echo "   Ephemeral keys are one-time use — generate a new one if needed."
  exit 1
fi

# ─── Step 3: Wait for Tailscale Connection ───────────────────
echo "⏳ Waiting for Tailscale mesh connection..."
TAILSCALE_IP=""
for i in $(seq 1 30); do
  TAILSCALE_IP=$(tailscale --socket=/tmp/tailscaled.sock ip -4 2>/dev/null || echo "")
  if [ -n "${TAILSCALE_IP}" ]; then
    echo "✅ Tailscale connected! IP: ${TAILSCALE_IP}"
    break
  fi
  sleep 1
done

if [ -z "${TAILSCALE_IP}" ]; then
  echo "⚠️  Tailscale did not get an IP within 30s. Continuing anyway..."
  echo "   The app will start but VPN won't work until Tailscale connects."
fi

# Show Tailscale status
echo "🌐 Tailscale Network:"
tailscale --socket=/tmp/tailscaled.sock status 2>/dev/null | head -10 || echo "   (status unavailable)"

# ─── Step 4: Pre-flight Connectivity Test ────────────────────
echo "🔍 Testing VPN connectivity..."

# Test MAP-API reachability (non-blocking)
if curl -s --max-time 5 --socks5 localhost:1055 http://dell-gb10:8000/health > /dev/null 2>&1; then
  echo "   ✅ MAP-API reachable (dell-gb10:8000)"
else
  echo "   ⚠️  MAP-API not reachable yet (dell-gb10:8000)"
  echo "      Check: dell-gb10 Tailscale status, MAP-API service, ACLs"
fi

# Test PostgreSQL reachability via SOCKS5 (just TCP connect)
if curl -s --max-time 5 --socks5 localhost:1055 telnet://rtx3060-db:5432 > /dev/null 2>&1; then
  echo "   ✅ PostgreSQL reachable (rtx3060-db:5432)"
else
  echo "   ⚠️  PostgreSQL not reachable yet (rtx3060-db:5432)"
  echo "      Check: rtx3060-db Tailscale status, PostgreSQL service, ACLs"
fi

# ─── Step 5: Start Next.js Server ────────────────────────────
echo ""
echo "🎬 Starting Next.js server on port 8080..."
echo "   ========================================"

# Set port for Azure App Service
export PORT=8080
export HOSTNAME=0.0.0.0

exec node server.js
