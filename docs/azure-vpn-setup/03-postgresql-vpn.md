# 03 — PostgreSQL Secure VPN Configuration

**Estimated Time:** 15 minutes  
**Node:** RTX 3060 (port 2222 SSH)

---

## Security Principle

PostgreSQL must:
- ✅ Listen on Tailscale interface (`100.64.2.20`) — NOT `0.0.0.0`
- ✅ Accept connections ONLY from authorized Tailscale IPs
- ✅ Require SSL/TLS for all remote connections
- ✅ Use SCRAM-SHA-256 authentication
- ✅ Reject everything else

---

## Step 1: Configure listen_addresses

```bash
# SSH into RTX 3060
ssh -p 2222 simrobotics@localhost

# Edit postgresql.conf
sudo nano /etc/postgresql/16/main/postgresql.conf
```

Find and update:
```ini
# Listen on private interfaces only
listen_addresses = '192.168.1.20,100.64.2.20,localhost'

# NOT '0.0.0.0' or '*' — that would expose to all interfaces
```

Multiple addresses explained:
- `192.168.1.20` — Local LAN (Dell GB10, admin laptop)
- `100.64.2.20` — Tailscale VPN (Azure, remote admin)
- `localhost` — Unix socket (local services)

---

## Step 2: Configure SSL/TLS

### 2.1 Generate Self-Signed Certificate (Quick)
```bash
# Generate certificate
sudo openssl req -new -x509 -days 365 -nodes \
  -text \
  -out /etc/ssl/certs/postgres.crt \
  -keyout /etc/ssl/private/postgres.key \
  -subj "/CN=rtx3060-db"

# Set permissions
sudo chmod 600 /etc/ssl/private/postgres.key
sudo chown postgres:postgres /etc/ssl/private/postgres.key
sudo chown postgres:postgres /etc/ssl/certs/postgres.crt
```

### 2.2 Enable SSL in postgresql.conf
```ini
ssl = on
ssl_cert_file = '/etc/ssl/certs/postgres.crt'
ssl_key_file = '/etc/ssl/private/postgres.key'
ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'
ssl_prefer_server_ciphers = on
```

---

## Step 3: Configure pg_hba.conf (Access Control)

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

```ini
# PostgreSQL Client Authentication Configuration
# /etc/postgresql/16/main/pg_hba.conf

# TYPE  DATABASE            USER            ADDRESS                 METHOD

# === Local Connections (Unix Socket) ===
local   all                 all                                     scram-sha-256

# === Local LAN (Trusted Internal Network) ===
host    all                 all             192.168.1.0/24          scram-sha-256

# === Tailscale VPN Connections ===

# Azure App Service → movieanimation_db (production traffic)
host    movieanimation_db   sim_admin       100.64.1.10/32          scram-sha-256
host    movieanimation_db   sim_admin       100.64.1.0/24           scram-sha-256

# Dell GB10 (MAP-API) → movieanimation_db (internal)
host    movieanimation_db   sim_admin       100.64.2.10/32          scram-sha-256

# Admin laptop via Tailscale → full access
host    all                 sim_admin       100.64.2.50/32          scram-sha-256
host    all                 sim_admin       100.64.2.0/24           scram-sha-256

# === Replication (future) ===
# host  replication         replicator      192.168.1.0/24          scram-sha-256

# === DENY Everything Else ===
host    all                 all             0.0.0.0/0               reject
```

> **Rule Order Matters:** PostgreSQL checks rules top-to-bottom and uses the FIRST match. The final `reject` line catches everything else.

---

## Step 4: Connection Pooling (Recommended)

Install PgBouncer to manage VPN connections efficiently:

```bash
sudo apt-get install -y pgbouncer

sudo tee /etc/pgbouncer/pgbouncer.ini << 'EOF'
[databases]
movieanimation_db = host=100.64.2.20 port=5432 dbname=movieanimation_db

[pgbouncer]
listen_addr = 100.64.2.20
listen_port = 6432
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
default_pool_size = 10
max_client_conn = 50
max_db_connections = 10
EOF

sudo systemctl enable pgbouncer
sudo systemctl start pgbouncer
```

Then update Azure's `DATABASE_URL` to use port `6432`:
```
postgresql://sim_admin:password@rtx3060-db:6432/movieanimation_db
```

---

## Step 5: Restart PostgreSQL

```bash
# Verify configuration
sudo -u postgres pg_isready

# Restart PostgreSQL
sudo systemctl restart postgresql

# Check it's listening on correct interfaces
sudo ss -tlnp | grep 5432
# Expected:
# LISTEN  100.64.2.20:5432
# LISTEN  192.168.1.20:5432
# LISTEN  127.0.0.1:5432
```

---

## Step 6: Verify VPN Database Access

### 6.1 From Local LAN (Dell GB10)
```bash
# Via LAN IP
psql "postgresql://sim_admin@192.168.1.20:5432/movieanimation_db" -c "SELECT 1"
# Should work ✓

# Via Tailscale IP
psql "postgresql://sim_admin@100.64.2.20:5432/movieanimation_db" -c "SELECT 1"
# Should work ✓
```

### 6.2 From Azure App Service (after deployment)
```bash
# SSH into Azure container
az webapp ssh --resource-group movieanimation-rg --name movieanimation-frontend

# Via SOCKS5 proxy (how the app connects)
psql "postgresql://sim_admin@rtx3060-db:5432/movieanimation_db?sslmode=require" -c "SELECT 1"
# Should work ✓
```

### 6.3 From Ronnie's Laptop (via Tailscale)
```bash
# Requires Tailscale running on laptop
psql "postgresql://sim_admin@rtx3060-db:5432/movieanimation_db?sslmode=require" -c "SELECT version()"
# Should work ✓
```

### 6.4 Verify Blocked Access
```bash
# Try connecting from an unauthorized IP (should fail)
# If another machine on 192.168.1.0/24 tries with wrong credentials:
psql "postgresql://fake_user@192.168.1.20:5432/movieanimation_db" -c "SELECT 1"
# Should fail ✗
```

---

## Step 7: Prisma Client Configuration (Azure Side)

The backend on Azure uses Prisma with a SOCKS5 proxy wrapper:

```typescript
// backend/src/config/prisma-vpn.ts
import { PrismaClient } from '@prisma/client';
import { SocksProxyAgent } from 'socks-proxy-agent';
import pg from 'pg';

// Create SOCKS5 proxy agent for all DB traffic
const proxyAgent = new SocksProxyAgent(
  process.env.TAILSCALE_SOCKS5 || 'socks5://127.0.0.1:1055'
);

// Patch pg to route through SOCKS5 when connecting to VPN hosts
const originalConnect = pg.Client.prototype.connect;
pg.Client.prototype.connect = function (callback?: any) {
  const params = (this as any).connectionParameters;
  if (params?.host && (
    params.host.includes('rtx3060-db') ||
    params.host.includes('100.64')
  )) {
    (this as any).stream = proxyAgent;
  }
  return originalConnect.call(this, callback);
};

export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
  connection: {
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    },
  },
});
```

---

## Monitoring Database Connections

```sql
-- Check active connections (including VPN)
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query_start,
  LEFT(query, 80) as query_preview
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start DESC;

-- Count connections by source
SELECT
  client_addr,
  count(*) as connections
FROM pg_stat_activity
GROUP BY client_addr
ORDER BY connections DESC;
```

---

## Troubleshooting

### "Connection refused" from Azure
1. Check PostgreSQL is listening on `100.64.2.20`:
   ```bash
   sudo ss -tlnp | grep 5432
   ```
2. Check Tailscale is running: `tailscale status`
3. Check ACLs allow `tag:azure-frontend → tag:database:5432`

### "No pg_hba.conf entry" error
- The connecting IP doesn't match any `host` line
- Check the exact IP from the error message and add a rule
- Remember: AWS/GCP/Azure IPs might be in ranges, use CIDR

### SSL errors
```bash
# Verify SSL is working
psql "postgresql://sim_admin@rtx3060-db:5432/movieanimation_db?sslmode=require" -c "SHOW ssl"
# Should return: on
```

### Too many connections
- Check `max_connections` in postgresql.conf (default 100)
- Use PgBouncer for connection pooling (Step 4)
- Reduce Prisma pool max from 10 to 5

---

**Next:** GPU rendering routing → `04-gpu-rendering-routing.md`
