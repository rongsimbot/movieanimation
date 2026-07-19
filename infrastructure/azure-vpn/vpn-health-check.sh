#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# MovieAnimation.ai — VPN Health Check Script
# ═══════════════════════════════════════════════════════════════
# Monitors Tailscale VPN tunnel, backend API, and DB connectivity.
# Designed to run as a cron job every 5 minutes.
#
# Cron entry:
#   */5 * * * * /path/to/vpn-health-check.sh >> /var/log/vpn-health.log 2>&1
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────
BACKEND_HOST="${BACKEND_HOST:-localhost}"
BACKEND_PORT="${BACKEND_PORT:-3001}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
SSH_PORT="${SSH_PORT:-2222}"
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
HEALTH_LOG="${HEALTH_LOG:-/var/log/vpn-health.log}"
ALERT_SCRIPT="${ALERT_SCRIPT:-}"  # Optional: path to alert script

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ISSUES=()

# ─── Logging ──────────────────────────────────────────────────
log() {
    echo "[${TIMESTAMP}] $*"
}

# ─── Check 1: Tailscale is Running ────────────────────────────
check_tailscale() {
    if ! systemctl is-active --quiet tailscaled 2>/dev/null; then
        ISSUES+=("tailscaled_service:dead")
        return 1
    fi

    # Check if we have a Tailscale IP
    if ! tailscale ip -4 &>/dev/null; then
        ISSUES+=("tailscale_ip:missing")
        return 1
    fi

    # Check if online
    if ! tailscale status --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('Self',{}).get('Online',False) else 1)" 2>/dev/null; then
        ISSUES+=("tailscale_online:false")
        return 1
    fi

    return 0
}

# ─── Check 2: Backend API Health ──────────────────────────────
check_backend_api() {
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
        "http://${BACKEND_HOST}:${BACKEND_PORT}/api/health" 2>/dev/null || echo "000")

    if [[ "$response" != "200" ]]; then
        ISSUES+=("backend_api:${response}")
        return 1
    fi

    return 0
}

# ─── Check 3: SSH Tunnel to RTX 3060 ──────────────────────────
check_ssh_tunnel() {
    if ! ssh -p "${SSH_PORT}" -o ConnectTimeout=5 -o BatchMode=yes \
        -o StrictHostKeyChecking=no simrobotics@localhost "echo OK" &>/dev/null; then
        ISSUES+=("ssh_tunnel:down")
        return 1
    fi

    return 0
}

# ─── Check 4: PostgreSQL Connectivity ─────────────────────────
check_postgres() {
    if ! PGPASSWORD='SimData_Vector_2026!' psql \
        -h "${DB_HOST}" -p "${DB_PORT}" -U sim_admin \
        -d movieanimation -c "SELECT 1" &>/dev/null 2>&1; then
        ISSUES+=("postgresql:unreachable")
        return 1
    fi

    return 0
}

# ─── Check 5: Redis Connectivity ──────────────────────────────
check_redis() {
    if command -v redis-cli &>/dev/null; then
        if ! redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" ping &>/dev/null; then
            ISSUES+=("redis:unreachable")
            return 1
        fi
    fi

    return 0
}

# ─── Check 6: VPN Latency ─────────────────────────────────────
check_vpn_latency() {
    # Ping the Tailscale gateway (100.100.100.100 is Tailscale's DERP test IP)
    local ping_result
    ping_result=$(ping -c 3 -W 2 100.100.100.100 2>/dev/null | tail -1 | awk -F'/' '{print $5}' || echo "timeout")

    if [[ "$ping_result" == "timeout" ]]; then
        ISSUES+=("vpn_latency:timeout")
        return 1
    fi

    return 0
}

# ─── Main Checks ──────────────────────────────────────────────
main() {
    local total_checks=6
    local passed=0

    # Run all checks
    check_tailscale && ((passed++)) || true
    check_backend_api && ((passed++)) || true
    check_ssh_tunnel && ((passed++)) || true
    check_postgres && ((passed++)) || true
    check_redis && ((passed++)) || true
    check_vpn_latency && ((passed++)) || true

    # ─── Report ───────────────────────────────────────────
    local health_line="[${TIMESTAMP}] HEALTH: ${passed}/${total_checks}"

    if [[ ${#ISSUES[@]} -eq 0 ]]; then
        log "${health_line} ALL_OK"
    else
        local issues_list
        issues_list=$(IFS=','; echo "${ISSUES[*]}")
        log "${health_line} ISSUES: [${issues_list}]"

        # Trigger alert if alert script is configured
        if [[ -n "${ALERT_SCRIPT}" ]] && [[ -x "${ALERT_SCRIPT}" ]]; then
            "${ALERT_SCRIPT}" "VPN Health Alert" "Issues detected: ${issues_list}" || true
        fi

        # Log to separate alert file for monitoring
        echo "[${TIMESTAMP}] ALERT: ${issues_list}" >> "${HEALTH_LOG}.alerts" 2>/dev/null || true
    fi

    # Return non-zero if any checks failed
    if [[ ${#ISSUES[@]} -gt 0 ]]; then
        exit 1
    fi

    exit 0
}

main "$@"
