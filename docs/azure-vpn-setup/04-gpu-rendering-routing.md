# 04 — GPU Rendering Request Routing

**Estimated Time:** 20 minutes  
**Node:** Dell GB10 (MAP-API Server)

---

## Overview

All GPU rendering requests from Azure App Service route through Tailscale VPN to the MAP-API running on Dell GB10. The RTX 3060 GPU does the actual CUDA processing.

```
User → Azure App Service → SOCKS5 Proxy → Tailscale → Dell GB10:8000 → RTX 3060 CUDA
```

---

## MAP-API Service Configuration

### Systemd Service

Create `/etc/systemd/system/map-api.service`:

```ini
[Unit]
Description=MovieAnimation Processing API (MAP-API)
After=network.target tailscaled.service
Requires=tailscaled.service

[Service]
Type=simple
User=simrobotics
WorkingDirectory=/home/simrobotics/map-api
Environment="MAP_API_KEY=<generated-key>"
Environment="DATABASE_URL=postgresql://sim_admin:<password>@rtx3060-db:5432/movieanimation_db"
ExecStart=/home/simrobotics/map-api/venv/bin/uvicorn app.main:app \
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

> **⚠️ Critical:** Bind to `100.64.2.10` (Tailscale IP), NOT `0.0.0.0`. This ensures MAP-API is only reachable through the VPN tunnel.

### Deploy the Service

```bash
# SSH into Dell GB10
ssh -p 2223 simrobotics@localhost

# Copy service file
sudo cp /home/simrobotics/movieanimation/docs/azure-vpn-setup/map-api.service \
  /etc/systemd/system/map-api.service

# Reload and enable
sudo systemctl daemon-reload
sudo systemctl enable map-api
sudo systemctl start map-api

# Verify
sudo systemctl status map-api
curl http://100.64.2.10:8000/health
# Expected: {"status": "healthy", "node": "dell-gb10"}
```

---

## Internal API Key Authentication

MAP-API uses an internal API key header for all requests. This adds an application-layer security check on top of the VPN tunnel.

### Key Generation
```bash
# Generate a strong random key
openssl rand -hex 32
# Example output: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2

# Save to .env on Dell GB10
echo 'MAP_API_KEY=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2' >> /home/simrobotics/map-api/.env

# Save to Azure App Service configuration
az webapp config appsettings set \
  --resource-group movieanimation-rg \
  --name movieanimation-frontend \
  --settings MAP_API_KEY="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2"
```

### Middleware Implementation
```python
# map-api/app/middleware.py
import os
import hmac
from fastapi import HTTPException, Request

INTERNAL_API_KEY = os.getenv("MAP_API_KEY")

async def validate_internal_key(request: Request, call_next):
    if request.url.path in ["/health", "/docs", "/openapi.json"]:
        return await call_next(request)

    provided_key = request.headers.get("X-Internal-API-Key", "")
    if not hmac.compare_digest(provided_key, INTERNAL_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid API key")

    return await call_next(request)
```

---

## API Endpoints

### Available Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `POST` | `/api/v1/video/render-scene` | Render single scene |
| `POST` | `/api/v1/video/render-batch` | Batch render multiple scenes |
| `POST` | `/api/v1/process/face-swap` | Local GPU face swap (Roop/ReActor) |
| `POST` | `/api/v1/movie/assemble` | FFmpeg stitching + audio sync |
| `GET` | `/api/v1/video/status/{job_id}` | Check render job status |
| `GET` | `/api/v1/video/download/{job_id}` | Download completed render |
| `GET` | `/api/v1/gpu/stats` | GPU utilization/memory stats |
| `POST` | `/api/v1/movie/export` | Export final movie (various formats) |

### Example: Render Scene from Azure

```typescript
// azure-backend/src/services/gpu-router.ts
import { SocksProxyAgent } from 'socks-proxy-agent';

const proxyAgent = new SocksProxyAgent(process.env.TAILSCALE_SOCKS5 || 'socks5://127.0.0.1:1055');

async function renderScene(scenePayload: {
  scriptId: string;
  sceneNumber: number;
  characters: Array<{ name: string; imageUrl: string }>;
  prompt: string;
  duration: number;
  resolution: '720p' | '1080p';
}): Promise<{ jobId: string; status: string }> {
  const response = await fetch('http://dell-gb10:8000/api/v1/video/render-scene', {
    method: 'POST',
    agent: proxyAgent,  // ← Routes through Tailscale SOCKS5 → WireGuard → Dell GB10
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': process.env.MAP_API_KEY!,
    },
    body: JSON.stringify(scenePayload),
    signal: AbortSignal.timeout(300000), // 5 minute timeout
  });

  if (!response.ok) {
    throw new Error(`MAP-API error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}
```

### Request Flow Diagram

```
1. User clicks "Generate Movie"
   ↓
2. Browser POST → Azure App Service /api/render
   ↓
3. Azure authenticates user (JWT), validates request
   ↓
4. Azure enqueues job (BullMQ/Redis on LoServer via VPN)
   ↓
5. Returns 202 Accepted with job ID to user

6. Worker picks up job from queue
   ↓
7. Prepares scene payload (prompt + character images)
   ↓
8. POST → SOCKS5://127.0.0.1:1055 → Tailscale → Dell GB10:8000/api/v1/video/render-scene
   ↓
9. MAP-API validates X-Internal-API-Key
   ↓
10. Routes to GPU worker on RTX 3060
    ├── Luma/Kling API (cloud AI video generation)
    ├── ReActor (local face swap)
    └── FFmpeg (stitching/assembly)
   ↓
11. Returns job ID to worker
   ↓
12. Worker polls GET /api/v1/video/status/{jobId} every 5s
   ↓
13. On completion, worker updates job status in PostgreSQL
   ↓
14. User polls GET /api/render/{jobId}/status → returns progress
   ↓
15. Completed video available via signed URL
```

---

## Fallback: Direct Cloud API Mode

If the VPN tunnel or Dell GB10 is unreachable, Azure can fall back to calling AI APIs directly (at higher cost):

```typescript
// azure-backend/src/services/gpu-router.ts (continued)

async function renderWithFallback(payload: ScenePayload) {
  try {
    // Primary: Route through VPN to local GPU
    return await renderViaLocalGPU(payload);
  } catch (error) {
    console.warn('⚠️ Local GPU unreachable, falling back to direct cloud APIs');
    console.warn('   This will incur higher API costs.');

    // Secondary: Call Luma/Kling directly from Azure
    return await renderViaCloudAPI(payload);
  }
}
```

---

## GPU Health Monitoring

```bash
# From Dell GB10, check GPU stats
nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv

# MAP-API GPU stats endpoint
curl http://100.64.2.10:8000/api/v1/gpu/stats
# Response:
# {
#   "gpu_utilization": 45.2,
#   "memory_used_mb": 4096,
#   "memory_total_mb": 12288,
#   "temperature_c": 68,
#   "active_jobs": 3
# }
```

---

## Troubleshooting

### MAP-API not reachable
```bash
# Check service status
sudo systemctl status map-api

# Check it's listening on correct interface
sudo ss -tlnp | grep 8000
# Should show: 100.64.2.10:8000

# Test locally on Dell GB10
curl http://100.64.2.10:8000/health

# Test from Azure (SSH into container)
az webapp ssh -g movieanimation-rg -n movieanimation-frontend
curl --socks5 localhost:1055 http://dell-gb10:8000/health
```

### API key rejected
```bash
# Verify key matches on both ends
# Dell GB10:
cat /home/simrobotics/map-api/.env | grep MAP_API_KEY

# Azure:
az webapp config appsettings list \
  --resource-group movieanimation-rg \
  --name movieanimation-frontend \
  --query "[?name=='MAP_API_KEY']" -o tsv

# Test with correct key
curl -H "X-Internal-API-Key: YOUR_KEY" http://dell-gb10:8000/api/v1/video/status/test123
```

### GPU out of memory
```bash
# Check GPU memory
nvidia-smi

# Reduce concurrent jobs in MAP-API config
# Set MAX_CONCURRENT_JOBS=4 (default 8)
```

---

**Next:** Firewall & security rules → `05-firewall-security.md`
