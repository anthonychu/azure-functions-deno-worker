```bash
deno install --allow-run --allow-read --allow-write --allow-net --unstable --name=denofunc denofunc.ts
```

```bash
region=centralus
resourceGroupName=<resource_group_name>
functionAppName=<function_app_name>
storageName=<storage_name>

# Create resource group
az group create -l $region -n $resourceGroupName

# Create storage account needed by function app
az storage account create -n $storageName -l $region -g $resourceGroupName --sku Standard_LRS

# Create function app
az functionapp create -n $functionAppName --storage-account $storageName --consumption-plan-location $region -g $resourceGroupName --functions-version 3 --runtime dotnet --os-type Linux

# Set app settings:
# - WEBSITE_MOUNT_ENABLED=1 enables squashfs which correctly sets the execute bit on the deno binary
az functionapp config appsettings set -n $functionAppName -g $resourceGroupName --settings "WEBSITE_MOUNT_ENABLED=1"

func azure functionapp publish $functionAppName --no-build -b local --force
```