# MovieAnimation.ai — Infrastructure
## Hybrid-Cloud Deployment Configuration

This directory contains all infrastructure-as-code and configuration for the hybrid-cloud deployment of MovieAnimation.ai.

### Directory Structure

```
infrastructure/
├── azure-vpn/                    # VPN Architecture (Azure ↔ SimRobotics LAN)
│   ├── ARCHITECTURE.md            # Full architecture documentation
│   ├── network-routing.md         # Network routing configuration
│   ├── vpn-health-check.sh        # Automated VPN health monitoring
│   ├── tailscale/                 # Tailscale VPN (primary, recommended)
│   │   ├── setup.sh               # Automated Tailscale installation
│   │   ├── tailscale-acl.json     # Access control lists
│   │   └── README.md
│   └── azure-gateway/             # Azure VPN Gateway (enterprise, future)
│       ├── azure-vpn-gateway.md   # Setup guide
│       └── vpn-gateway.bicep     # Azure Bicep deployment template
├── azure/                         # Azure Cloud Configuration
│   ├── app-service-deploy.yml     # GitHub Actions CI/CD pipeline
│   └── network-security.md        # Firewall & security rules
└── README.md                      # This file
```

### Quick Start

1. **Set up VPN:**
   ```bash
   # Primary: Tailscale
   cd infrastructure/azure-vpn/tailscale
   sudo TAILSCALE_AUTH_KEY=tskey-auth-... ./setup.sh
   ```

2. **Deploy Frontend to Azure:**
   - Push to `main` branch (auto-deploys via GitHub Actions)
   - Or manually: `az webapp deploy ...`

3. **Monitor VPN Health:**
   ```bash
   ./infrastructure/azure-vpn/vpn-health-check.sh
   ```

### Architecture Summary

```
Internet → Azure App Service (Next.js) → Tailscale VPN → LoServer (Backend/Redis/FFmpeg) → SSH Tunnel → RTX 3060 (PostgreSQL/GPU)
```

### Cost
- **Current (Tailscale):** ~$18/month
- **Future (Azure VPN Gateway):** ~$160/month
- **Savings vs Full Azure:** 98.5% ($1,182/month)
