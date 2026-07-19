// ═══════════════════════════════════════════════════════════
// MovieAnimation.ai — Azure VPN Gateway (Bicep Template)
// ═══════════════════════════════════════════════════════════
// Deploys: VNet, Subnets, VPN Gateway, Local Network Gateway,
//          Site-to-Site Connection, and App Service VNet Integration
//
// Usage:
//   az deployment group create \
//     --resource-group movieanimation-rg \
//     --template-file vpn-gateway.bicep \
//     --parameters vpnGatewayName=movieanimation-vpn-gw \
//                  localGatewayPublicIp=YOUR_PUBLIC_IP \
//                  localAddressSpace=192.168.1.0/24 \
//                  sharedKey=YOUR_STRONG_SHARED_KEY_32_CHARS
// ═══════════════════════════════════════════════════════════

@description('Name of the Virtual Network Gateway')
param vpnGatewayName string = 'movieanimation-vpn-gw'

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Public IP address of the on-premises (SimRobotics) network endpoint')
param localGatewayPublicIp string

@description('On-premises network address space (SimRobotics LAN)')
param localAddressSpace string = '192.168.1.0/24'

@description('Pre-shared key for IPsec/IKEv2 connection (min 8 chars, recommended 32+)')
@secure()
param sharedKey string

@description('VPN Gateway SKU')
@allowed([
  'Basic'
  'VpnGw1'
  'VpnGw2'
  'VpnGw3'
])
param gatewaySku string = 'Basic'

@description('Gateway subnet address prefix')
param gatewaySubnetPrefix string = '10.0.1.0/27'

@description('App Service integration subnet address prefix')
param appSubnetPrefix string = '10.0.2.0/24'

@description('Azure VNet address space')
param vnetAddressPrefix string = '10.0.0.0/16'

// ─── Resources ───────────────────────────────────────────────

// Virtual Network
resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: 'movieanimation-vnet'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [vnetAddressPrefix]
    }
    subnets: [
      {
        name: 'GatewaySubnet'
        properties: {
          addressPrefix: gatewaySubnetPrefix
        }
      }
      {
        name: 'AppSubnet'
        properties: {
          addressPrefix: appSubnetPrefix
          delegations: [
            {
              name: 'appServiceDelegation'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
    ]
  }
}

// Public IP for VPN Gateway
resource vpnGatewayPublicIp 'Microsoft.Network/publicIPAddresses@2024-01-01' = {
  name: '${vpnGatewayName}-pip'
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    publicIPAllocationMethod: 'Dynamic'
  }
}

// Virtual Network Gateway
resource vpnGateway 'Microsoft.Network/virtualNetworkGateways@2024-01-01' = {
  name: vpnGatewayName
  location: location
  properties: {
    gatewayType: 'Vpn'
    vpnType: 'RouteBased'
    sku: {
      name: gatewaySku
      tier: gatewaySku
    }
    ipConfigurations: [
      {
        name: 'default'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: {
            id: vnet.properties.subnets[0].id
          }
          publicIPAddress: {
            id: vpnGatewayPublicIp.id
          }
        }
      }
    ]
    activeActive: false
    enableBgp: false
  }
}

// Local Network Gateway (SimRobotics LAN)
resource localGateway 'Microsoft.Network/localNetworkGateways@2024-01-01' = {
  name: 'simrobotics-local-gw'
  location: location
  properties: {
    gatewayIpAddress: localGatewayPublicIp
    localNetworkAddressSpace: {
      addressPrefixes: [localAddressSpace]
    }
  }
}

// Site-to-Site VPN Connection
resource vpnConnection 'Microsoft.Network/connections@2024-01-01' = {
  name: 'movieanimation-s2s-connection'
  location: location
  properties: {
    connectionType: 'IPsec'
    virtualNetworkGateway1: {
      id: vpnGateway.id
    }
    localNetworkGateway2: {
      id: localGateway.id
    }
    sharedKey: sharedKey
    connectionProtocol: 'IKEv2'
    routingWeight: 0
    enableBgp: false
    ipsecPolicies: [
      {
        saLifeTimeSeconds: 27000
        saDataSizeKilobytes: 102400000
        ipsecEncryption: 'AES256'
        ipsecIntegrity: 'SHA256'
        ikeEncryption: 'AES256'
        ikeIntegrity: 'SHA256'
        dhGroup: 'DHGroup14'
        pfsGroup: 'None'
      }
    ]
  }
}

// ─── Outputs ─────────────────────────────────────────────────

output vpnGatewayPublicIpAddress string = vpnGatewayPublicIp.properties.ipAddress
output vpnGatewayId string = vpnGateway.id
output vnetId string = vnet.id
output localGatewayId string = localGateway.id
output connectionId string = vpnConnection.id
output gatewaySubnetId string = vnet.properties.subnets[0].id
output appSubnetId string = vnet.properties.subnets[1].id
