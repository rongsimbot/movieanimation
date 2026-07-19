#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# MovieAnimation.ai — Tailscale VPN Setup Script
# ═══════════════════════════════════════════════════════════════
# Sets up Tailscale on LoServer to connect Azure ↔ SimRobotics LAN
#
# Prerequisites:
#   1. Get auth key from https://login.tailscale.com/admin/settings/keys
#   2. Set env var: export TAILSCALE_AUTH_KEY="tskey-auth-..."
#
# Usage:
#   chmod +x setup.sh
#   sudo TAILSCALE_AUTH_KEY="tskey-auth-..." ./setup.sh
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail
IFS=$'\n\t'

# ─── Color Output ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ─── Pre-flight Checks ────────────────────────────────────────
log_step "Pre-flight Checks"

# Must run as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (sudo)."
    exit 1
fi

# Check auth key
if [[ -z "${TAILSCALE_AUTH_KEY:-}" ]]; then
    log_error "TAILSCALE_AUTH_KEY environment variable is required."
    echo ""
    echo "  Get your key from: https://login.tailscale.com/admin/settings/keys"
    echo "  Then run: sudo TAILSCALE_AUTH_KEY=\"tskey-auth-...\" $0"
    exit 1
fi

if [[ ! "$TAILSCALE_AUTH_KEY" =~ ^tskey-auth- ]]; then
    log_error "TAILSCALE_AUTH_KEY doesn't look valid (should start with 'tskey-auth-')."
    exit 1
fi

log_ok "Running as root"
log_ok "Auth key present"

# ─── Step 1: Install Tailscale ────────────────────────────────
log_step "Step 1: Installing Tailscale"

if command -v tailscale &>/dev/null; then
    CURRENT_VERSION=$(tailscale version | head -1 | awk '{print $2}')
    log_warn "Tailscale already installed (${CURRENT_VERSION}). Updating..."
    curl -fsSL https://tailscale.com/install.sh | sh
else
    log_info "Installing Tailscale via official script..."
    curl -fsSL https://tailscale.com/install.sh | sh
fi

# Verify installation
if ! command -v tailscale &>/dev/null; then
    log_error "Tailscale installation failed."
    exit 1
fi

INSTALLED_VERSION=$(tailscale version | head -1 | awk '{print $2}')
log_ok "Tailscale ${INSTALLED_VERSION} installed"

# ─── Step 2: Detect Network Interfaces ────────────────────────
log_step "Step 2: Detecting Local Network"

# Find primary LAN interface and subnet
LAN_IFACE=$(ip route show default | awk '/default/ {print $5}' | head -1)
LAN_SUBNET=$(ip -4 addr show "$LAN_IFACE" | grep -oP '(?<=inet\s)\d+(\.\d+){3}/\d+' | head -1)

if [[ -z "$LAN_SUBNET" ]]; then
    log_warn "Could not auto-detect LAN subnet. Using common defaults."
    LAN_SUBNETS="192.168.1.0/24,10.0.0.0/24"
else
    log_info "Detected interface: ${LAN_IFACE}"
    log_info "Detected subnet:    ${LAN_SUBNET}"
    LAN_SUBNETS="${LAN_SUBNET},10.0.0.0/24"
fi

# ─── Step 3: Authenticate and Connect ─────────────────────────
log_step "Step 3: Authenticating with Tailscale"

# Set hostname for easy identification
HOSTNAME_SHORT=$(hostname -s 2>/dev/null || echo "loserver")
TAILSCALE_HOSTNAME="${HOSTNAME_SHORT}-simrobotics"

log_info "Using hostname: ${TAILSCALE_HOSTNAME}"
log_info "Advertising routes: ${LAN_SUBNETS}"

# Start Tailscale with route advertisement
tailscale up \
    --authkey "${TAILSCALE_AUTH_KEY}" \
    --hostname "${TAILSCALE_HOSTNAME}" \
    --advertise-routes "${LAN_SUBNETS}" \
    --advertise-exit-node \
    --accept-routes \
    --accept-dns \
    --stateful-filtering \
    --ssh

if [[ $? -ne 0 ]]; then
    log_error "Failed to authenticate with Tailscale."
    log_error "Check your auth key at: https://login.tailscale.com/admin/settings/keys"
    exit 1
fi

log_ok "Authenticated successfully"

# ─── Step 4: Verify Connection ────────────────────────────────
log_step "Step 4: Verifying Connection"

# Wait for connection to stabilize
sleep 3

TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")

if [[ -z "$TAILSCALE_IP" ]]; then
    log_error "Could not get Tailscale IP. Connection may have failed."
    exit 1
fi

TAILSCALE_STATUS=$(tailscale status --json 2>/dev/null || echo '{"Self":{}}')
TAILSCALE_ONLINE=$(echo "$TAILSCALE_STATUS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('Self',{}).get('Online',False))" 2>/dev/null || echo "unknown")

log_info "Tailscale IP:     ${TAILSCALE_IP}"
log_info "Tailscale Status: ${TAILSCALE_ONLINE}"

# Test MagicDNS
if host "${TAILSCALE_HOSTNAME}" &>/dev/null 2>&1; then
    log_ok "MagicDNS resolving: ${TAILSCALE_HOSTNAME}"
else
    log_warn "MagicDNS not resolving yet (may take a few minutes to propagate)"
fi

tailscale status 2>/dev/null | head -5

log_ok "Connection verified"

# ─── Step 5: Enable Auto-Start ────────────────────────────────
log_step "Step 5: Enabling Auto-Start"

systemctl enable tailscaled 2>/dev/null || log_warn "Could not enable tailscaled service"

# Verify service is active
if systemctl is-active --quiet tailscaled; then
    log_ok "tailscaled service: active and enabled"
else
    log_error "tailscaled service is not running!"
    systemctl status tailscaled --no-pager | head -10
    exit 1
fi

# ─── Step 6: Configure Firewall (UFW) ─────────────────────────
log_step "Step 6: Configuring Firewall"

if command -v ufw &>/dev/null; then
    UFW_STATUS=$(ufw status | head -1)
    log_info "UFW status: ${UFW_STATUS}"

    # Allow Tailscale interface
    ufw allow in on tailscale0 comment "Tailscale VPN" 2>/dev/null || true
    ufw allow out on tailscale0 comment "Tailscale VPN" 2>/dev/null || true

    # Allow WireGuard port (41641 UDP) if needed for direct connections
    ufw allow 41641/udp comment "Tailscale WireGuard" 2>/dev/null || true

    log_ok "UFW rules configured"
else
    log_warn "UFW not found. If using iptables directly, ensure Tailscale traffic is allowed."
    log_warn "Run: iptables -A INPUT -i tailscale0 -j ACCEPT"
fi

# ─── Step 7: Setup Health Check Cron ──────────────────────────
log_step "Step 7: Setting Up Health Check"

HEALTH_CHECK_SCRIPT="${HOME}/movieanimation/infrastructure/azure-vpn/vpn-health-check.sh"

if [[ -f "$HEALTH_CHECK_SCRIPT" ]]; then
    # Add cron job (runs every 5 minutes)
    CRON_JOB="*/5 * * * * ${HEALTH_CHECK_SCRIPT} >> /var/log/tailscale-health.log 2>&1"

    # Check if already installed
    if crontab -l 2>/dev/null | grep -qF "$HEALTH_CHECK_SCRIPT"; then
        log_info "Health check cron already installed"
    else
        (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
        log_ok "Health check cron installed (runs every 5 min)"
    fi
else
    log_warn "Health check script not found at: ${HEALTH_CHECK_SCRIPT}"
    log_warn "Skipping cron setup. Run vpn-health-check.sh manually after deploying it."
fi

# ─── Step 8: Print Summary ────────────────────────────────────
log_step "Setup Complete!"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Tailscale VPN Setup — COMPLETE ✅                ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}                                                        "
echo -e "${GREEN}║${NC}  Tailscale IP:    ${CYAN}${TAILSCALE_IP}${NC}"
echo -e "${GREEN}║${NC}  Hostname:        ${CYAN}${TAILSCALE_HOSTNAME}${NC}"
echo -e "${GREEN}║${NC}  Advertised Routes: ${CYAN}${LAN_SUBNETS}${NC}"
echo -e "${GREEN}║${NC}  Exit Node:       ${CYAN}Enabled${NC}"
echo -e "${GREEN}║${NC}  Auto-Start:      ${CYAN}Enabled${NC}"
echo -e "${GREEN}║${NC}                                                        "
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  NEXT STEPS:                                           "
echo -e "${GREEN}║${NC}  1. Approve routes in Tailscale admin console:         "
echo -e "${GREEN}║${NC}     https://login.tailscale.com/admin/machines        "
echo -e "${GREEN}║${NC}  2. Configure Azure App Service with Tailscale IP      "
echo -e "${GREEN}║${NC}  3. Run vpn-health-check.sh to verify                  "
echo -e "${GREEN}║${NC}  4. Update BACKEND_URL in Azure to:                    "
echo -e "${GREEN}║${NC}     http://${TAILSCALE_IP}:3001/api                     "
echo -e "${GREEN}║${NC}                                                        "
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

exit 0
