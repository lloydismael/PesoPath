targetScope = 'resourceGroup'

@description('Name of the new Azure Static Web App.')
param staticWebAppName string = 'swa-pesopath-prod-7989'

@description('Azure region for the Static Web App.')
param location string = 'eastasia'

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  tags: {
    'app-onboard-skill': 'true'
  }
  properties: {}
}

output staticWebAppName string = staticWebApp.name
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
