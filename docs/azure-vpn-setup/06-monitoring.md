# 06 — VPN Health Monitoring & Alerting

**Runs on:** Dell GB10 (primary), any node (secondary)  
**Schedule:** Every 5 minutes via cron

---

## Health Check Script

The health check script is at `infrastructure/azure-vpn/vpn-health-check.sh`.

### What It Checks

| Check | What | Success Criteria |
|-------|------|-----------------|
| tailscaled | Service running | systemctl is-active |
| Tailscale IP | Node has IP | tailscale ip -4 returns |
| Tailscale online | Connected to tailnet | Self.Online == true |
| Backend API | Next.js backend | HTTP 200 from /api/health |
| SSH Tunnel | RTX 3060 reachable | SSH connection succeeds |
| PostgreSQL | DB reachable | SELECT 1 succeeds |
| Redis | Cache reachable | PING → PONG |
| VPN Latency | WireGuard ping | <100ms average |

### Install the Cron Job

```bash
# Copy the script if needed
cp infrastructure/azure-vpn/vpn-health-check.sh /usr/local/bin/
chmod +x /usr/local/bin/vpn-health-check.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/vpn-health-check.sh >> /var/log/vpn-health.log 2>&1") | crontab -

# View recent health checks
tail -20 /var/log/vpn-health.log
```

---

## Tailscale Admin Console Monitoring

Go to: https://login.tailscale.com/admin/machines

### What to Watch
- **Node Status:** All nodes should show 🟢 (online)
- **Last Seen:** Should be <5 minutes for all nodes
- **Relay vs Direct:** Prefer "direct" connections (lower latency)
- **Exit Node:** Should NOT be enabled on Azure node

### Alert Configuration
- Tailscale → Settings → Webhooks
- Add Discord/Slack webhook for node offline events

---

## Azure Monitoring

### Application Insights

```bash
# Enable for App Service
az webapp config appsettings set \
  --resource-group movieanimation-rg \
  --name movieanimation-frontend \
  --settings \
    APPINSIGHTS_INSTRUMENTATIONKEY="<key>" \
    APPLICATIONINSIGHTS_CONNECTION_STRING="<connection-string>"
```

### Key Metrics to Monitor
- **Response time:** Should be <500ms p95 for most endpoints
- **Failed requests:** Alert if >5% error rate
- **Server errors (5xx):** Alert immediately
- **CPU/Memory:** Alert if CPU >80% sustained

### Azure Alerts
```bash
# Create alert rule for high error rate
az monitor metrics alert create \
  --name "movieanimation-high-errors" \
  --resource-group movieanimation-rg \
  --scopes "/subscriptions/SUB_ID/resourceGroups/movieanimation-rg/providers/Microsoft.Web/sites/movieanimation-frontend" \
  --condition "Http5xx > 10 count period=5m" \
  --description "Alert when 5xx errors exceed 10 in 5 minutes"
```

---

## Manual Verification Commands

### Full System Health Check
```bash
#!/bin/bash
# Run this from any node to verify full VPN health

echo "=== Tailscale Mesh Status ==="
tailscale status

echo ""
echo "=== MAP-API Health ==="
curl -s --max-time 5 http://dell-gb10:8000/health | python3 -m json.tool 2>/dev/null || echo "❌ MAP-API unreachable"

echo ""
echo "=== PostgreSQL Health ==="
PGPASSWORD='password' psql -h rtx3060-db -p 5432 -U sim_admin -d movieanimation_db -c "SELECT 1 AS db_check" 2>/dev/null || echo "❌ PostgreSQL unreachable"

echo ""
echo "=== Redis Health ==="
redis-cli -h loserver ping 2>/dev/null || echo "❌ Redis unreachable"

echo ""
echo "=== Azure Frontend Health ==="
curl -s --max-time 5 http://movieanimation-azure:8080/api/health 2>/dev/null || echo "❌ Azure unreachable"
```

---

## Incident Response

### Scenario: VPN Tunnel Down

**Symptoms:**
- `tailscale status` shows nodes as "offline"
- Azure can't reach PostgreSQL or MAP-API
- Health check reports `tailscale_online:false`

**Response:**
```bash
# 1. Check if Tailscale service is running
sudo systemctl status tailscaled

# 2. Restart if needed
sudo systemctl restart tailscaled

# 3. Check auth key validity
tailscale status  # Look for "auth error"

# 4. Re-authenticate if needed
sudo tailscale up --authkey="tskey-auth-..." --reset

# 5. Verify connectivity
tailscale ping dell-gb10
```

### Scenario: PostgreSQL Unreachable from Azure

**Symptoms:**
- Azure health check shows `db: false`
- Users see "Database error" messages

**Response:**
```bash
# 1. From RTX 3060, check PostgreSQL
sudo systemctl status postgresql
sudo ss -tlnp | grep 5432

# 2. Check pg_hba.conf matches connecting IP
sudo cat /etc/postgresql/16/main/pg_hba.conf | grep 100.64

# 3. Check Tailscale on RTX 3060
tailscale status

# 4. Check iptables isn't blocking
sudo iptables -L INPUT -v -n | grep 5432
```

### Scenario: Azure App Service Crash Loop

**Symptoms:**
- Frontend returns 503
- Container logs show restart cycle

**Response:**
```bash
# 1. Check container logs
az webapp log tail --resource-group movieanimation-rg --name movieanimation-frontend

# 2. Common causes:
#    - TAILSCALE_AUTHKEY expired → regenerate ephemeral key
#    - OOM (memory exhausted) → Check B1 plan capacity
#    - Startup script failure → Check start.sh syntax

# 3. Restart the app
az webapp restart --resource-group movieanimation-rg --name movieanimation-frontend
```

---

## Log Locations

| Log | Location | Rotation |
|-----|----------|----------|
| Tailscale VPN health | `/var/log/vpn-health.log` | Weekly |
| Tailscale health alerts | `/var/log/vpn-health.log.alerts` | Monthly |
| MAP-API logs | `journalctl -u map-api` | Systemd |
| PostgreSQL logs | `/var/log/postgresql/postgresql-16-main.log` | Daily |
| Azure container logs | `az webapp log tail` | Azure-managed |

---

## Simple Telegram Alert Script

```bash
#!/bin/bash
# /usr/local/bin/vpn-alert-telegram.sh
# Send Telegram alert when VPN health check fails
#
# Setup: Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID

BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
CHAT_ID="${TELEGRAM_CHAT_ID}"
MESSAGE="🚨 VPN Health Alert: $1"

if [[ -n "$BOT_TOKEN" ]] && [[ -n "$CHAT_ID" ]]; then
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    -d "text=${MESSAGE}" \
    -d "parse_mode=HTML" \
    > /dev/null
fi
```

---

**All setup guides complete.** Proceed to the configuration files in this directory for implementation.
