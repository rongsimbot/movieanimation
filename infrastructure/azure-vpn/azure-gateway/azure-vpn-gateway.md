# Azure VPN Gateway Setup (Enterprise Alternative)
## MovieAnimation.ai — Site-to-Site VPN to SimRobotics LAN

**Status:** Future (when MRR exceeds $10K/month or compliance requires)  
**Current VPN:** Tailscale (see `../tailscale/setup.sh`)  
**Estimated Setup Time:** 2-4 hours  
**Monthly Cost:** ~$138 (Basic SKU)

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ AZURE CLOUD                                                        │
│                                                                    │
│  ┌─────────────────────────────────┐                               │
│  │ Resource Group: movieanimation  │                               │
│  │                                 │                               │
│  │  ┌───────────────────────────┐  │                               │
│  │  │ VNet: movieanimation-vnet │  │     ┌─────────────────────┐   │
│  │  │ 10.0.0.0/16              │  │     │ SimRobotics LAN     │   │
│  │  │                           │  │     │ 192.168.1.0/24     │   │
│  │  │  ┌─────────────────────┐  │  │     │                     │   │
│  │  │  │ GatewaySubnet       │  │  │     │ ┌─────────────────┐ │   │
│  │  │  │ 10.0.1.0/27        │  │  │     │ │ On-Prem VPN     │ │   │
│  │  │  │                     │  │  │     │ │ Device /        │ │   │
│  │  │  │ [VPN Gateway]       │══╪══╪═════╪═│ StrongSwan      │ │   │
│  │  │  │ SKU: Basic/VpnGw1  │  │  │IPsec│ │ │                 │ │   │
│  │  │  └─────────────────────┘  │  │     │ └─────────────────┘ │   │
│  │  │                           │  │     └─────────────────────┘   │
│  │  │  ┌─────────────────────┐  │  │                               │
│  │  │  │ AppSubnet           │  │  │                               │
│  │  │  │ 10.0.2.0/24        │  │  │                               │
│  │  │  │                     │  │  │                               │
│  │  │  │ [App Service VNet   │  │  │                               │
│  │  │  │  Integration]       │  │  │                               │
│  │  │  └─────────────────────┘  │  │                               │
│  │  └───────────────────────────┘  │                               │
│  └─────────────────────────────────┘                               │
└────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

1. **Azure Subscription** (Pay-As-You-Go or better)
2. **Azure CLI** installed and authenticated:
   ```bash
   az login
   az account set --subscription "SimRobotics Production"
   ```
3. **Public IP** on SimRobotics LAN (or dynamic DNS for residential IPs)
4. **Router port forwarding:** UDP 500 (ISAKMP), UDP 4500 (IPsec NAT-T)
5. **Azure Bicep CLI** installed:
   ```bash
   az bicep install
   ```

---

## Step-by-Step Deployment

### Step 1: Deploy Azure Resources (Bicep)

```bash
cd ~/.openclaw/workspace/projects/movieanimation/infrastructure/azure-vpn/azure-gateway

# Create resource group
az group create \
    --name movieanimation-rg \
    --location eastus

# Deploy VPN infrastructure
az deployment group create \
    --resource-group movieanimation-rg \
    --template-file vpn-gateway.bicep \
    --parameters \
        vpnGatewayName=movieanimation-vpn-gw \
        localGatewayPublicIp=YOUR_PUBLIC_IP \
        localAddressSpace=192.168.1.0/24 \
        sharedKey=YOUR_STRONG_SHARED_KEY_32_CHARS

# NOTE: VPN Gateway deployment takes 30-45 minutes!
```

### Step 2: Configure On-Premises Side (StrongSwan on LoServer)

```bash
# Install StrongSwan
sudo apt-get update
sudo apt-get install -y strongswan strongswan-pki libcharon-extra-plugins

# Create IPsec configuration
sudo tee /etc/ipsec.conf << 'EOF'
config setup
    charondebug="ike 2, knl 2, cfg 2"
    uniqueids=no

conn azure-vpn
    type=tunnel
    keyexchange=ikev2
    authby=secret
    left=%defaultroute
    leftid=YOUR_PUBLIC_IP
    leftsubnet=192.168.1.0/24
    right=AZURE_VPN_GATEWAY_PUBLIC_IP
    rightsubnet=10.0.0.0/16
    ike=aes256-sha256-modp2048!
    esp=aes256-sha256!
    dpddelay=30
    dpdtimeout=120
    dpdaction=restart
    auto=start
EOF

# Set pre-shared key
sudo tee /etc/ipsec.secrets << 'EOF'
YOUR_PUBLIC_IP AZURE_VPN_GATEWAY_PUBLIC_IP : PSK "YOUR_STRONG_SHARED_KEY"
EOF

# Start StrongSwan
sudo systemctl enable strongswan-starter
sudo systemctl restart strongswan-starter

# Verify connection
sudo ipsec status azure-vpn
```

### Step 3: Configure Azure App Service VNet Integration

```bash
# Enable VNet integration on App Service
az webapp vnet-integration add \
    --resource-group movieanimation-rg \
    --name movieanimation-frontend \
    --vnet movieanimation-vnet \
    --subnet AppSubnet
```

### Step 4: Configure Routing

```bash
# On LoServer, add route for Azure VNet
sudo ip route add 10.0.0.0/16 via STRONGSWAN_TUNNEL_IP

# Make persistent
echo "10.0.0.0/16 via STRONGSWAN_TUNNEL_IP" | sudo tee -a /etc/network/interfaces.d/vpn-routes
```

### Step 5: Verify Connectivity

```bash
# From Azure (use Cloud Shell or VM in VNet)
ping 192.168.1.X    # Should reach LoServer
curl http://192.168.1.X:3001/api/health

# From LoServer
ping 10.0.2.X       # Should reach App Service VNet
```

---

## VPN Gateway SKU Comparison

| SKU | Max Throughput | S2S Tunnels | P2S Connections | Monthly Cost |
|-----|---------------|-------------|-----------------|--------------|
| Basic | 100 Mbps | 10 | 128 | ~$138 |
| VpnGw1 | 650 Mbps | 30 | 250 | ~$280 |
| VpnGw2 | 1 Gbps | 30 | 500 | ~$550 |
| VpnGw3 | 1.25 Gbps | 30 | 1000 | ~$1,100 |

**Recommendation:** Start with Basic; upgrade to VpnGw1 when throughput exceeds 80 Mbps sustained.

---

## IPsec Parameters

For compatibility between Azure VPN Gateway and StrongSwan:

| Parameter | Azure | StrongSwan |
|-----------|-------|------------|
| IKE Version | IKEv2 | IKEv2 |
| Encryption | AES256 | AES256 |
| Integrity | SHA256 | SHA256 |
| DH Group | DHGroup14 (2048-bit) | modp2048 |
| IPsec Encryption | AES256 | AES256 |
| IPsec Integrity | SHA256 | SHA256 |
| PFS Group | None | -
| SA Lifetime | 27000 seconds | 8 hours |
| DPD | Enabled (10s) | 30s interval, 120s timeout |

---

## Migration from Tailscale to Azure VPN Gateway

1. **Deploy Azure VPN Gateway** (Step 1 above)
2. **Configure StrongSwan** on LoServer (Step 2 above)
3. **Configure routing** on both sides (Step 4 above)
4. **Update App Service** to use VNet integration (Step 3 above)
5. **Test all connectivity** (Step 5 above)
6. **Update DNS** / environment variables for API URLs
7. **Keep Tailscale running** for 1 week as fallback
8. **Decommission Tailscale** after 7 days of stable Azure VPN

---

## Monitoring

```bash
# Azure Monitor metrics
az monitor metrics list \
    --resource /subscriptions/SUB_ID/resourceGroups/movieanimation-rg/providers/Microsoft.Network/vpnGateways/movieanimation-vpn-gw \
    --metric TunnelAverageBandwidth \
    --interval PT5M

# Connection status
az network vpn-connection show \
    --resource-group movieanimation-rg \
    --name movieanimation-s2s-connection \
    --query connectionStatus
```

---

## Troubleshooting

### Connection Not Establishing
```bash
# Check StrongSwan logs
sudo journalctl -u strongswan-starter -f

# Verify firewall rules
sudo ufw status verbose

# Check Azure side
az network vpn-connection show \
    --resource-group movieanimation-rg \
    --name movieanimation-s2s-connection \
    --query connectionStatus
```

### Traffic Not Routing
```bash
# Check IPsec policies match
sudo ipsec statusall | grep azure-vpn

# Verify routes
ip route show | grep 10.0.0.0
```

---

## Cost-Benefit Analysis

| Factor | Tailscale | Azure VPN Gateway |
|--------|-----------|-------------------|
| Monthly Cost | $0-18 | $138-280 |
| Setup Time | 10 min | 2-4 hours |
| Maintenance | Near-zero | Moderate |
| SLA | Best-effort | 99.9% |
| Monitoring | Basic | Azure Monitor |
| Compliance | Standard | Enterprise-ready |

**Decision Matrix:**
- MRR < $10K: Tailscale ✅
- MRR $10K-$50K: Tailscale with monitoring ✅
- MRR $50K+: Azure VPN Gateway ✅
- Enterprise compliance required: Azure VPN Gateway ✅
