# Deno Worker for Azure Functions

```
           @@@@@@@@@@@,         
       @@@@@@@@@@@@@@@@@@@                        %%%%%%
     @@@@@@        %%%%@@@@@@                     %%%%%%
   @@@@@ @  @           *@@@@@              @   %%%%%%    @
   @@@                    @@@@@           @@   %%%%%%      @@
  @@@@@                   @@@@@        @@@    %%%%%%%%%%%    @@@
  @@@@@@@@&&&&@@@          @@@@      @@      %%%%%%%%%%        @@
   @@@@@@@@@@@@@@          @@@@        @@         %%%%       @@
    @@@@@@@@@@@@@@         @@@           @@      %%%       @@
     @@@@@@@@@@@@@         @               @@    %%      @@
       @@@@@@@@@@@                              %%
            @@@@@@@                             %
```

## Overview

This is a worker that lets you run Deno on [Azure Functions](https://docs.microsoft.com/azure/azure-functions/functions-overview). It implements the [Azure Functions Custom Handlers](https://docs.microsoft.com/azure/azure-functions/functions-custom-handlers) protocol and runs on the Azure Functions Consumption (serverless) plan.

The project includes a CLI `denofunc` to make it easy to create, run, and deploy your Deno Azure Functions apps.

## Prerequisites

> Note: Currently, this has only been tested to run locally on macOS. It should run on Linux and Windows as well, but needs to be verified.

* [Deno](https://deno.land/x/install/) - 1.0.0-rc2 or above
* [Azure Functions Core Tools V3](https://github.com/Azure/azure-functions-core-tools#azure-functions-core-tools) - needed for running the app locally and deploying it
* [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli?view=azure-cli-latest#install) - needed to deploy the app
* `denofunc` CLI - see [below](#installing-the-denofunc-cli)

### Installing the denofunc CLI

To help create, run, and deploy a Deno for Azure Functions app, you need to install the `denofunc` CLI. `denofunc` wraps the Azure Functions Core Tools (`func`) and is used for generating artifacts required to run/deploy the app.

To install the CLI, run the following Deno command.

```bash
deno install --allow-run --allow-read --allow-write --allow-net --unstable --name=denofunc \
    https://raw.githubusercontent.com/anthonychu/azure-functions-deno-worker/master/denofunc.ts
```

## Getting started

### Create and run an app locally

1. Create and change into an empty folder.

1. Initialize the project:

    ```bash
    denofunc init
    ```

    A few of the files that are important to know about:
    - `functions/*` - your functions
    - `worker.ts` - the Deno worker used by Azure Functions
    - `host.json` - configuration of the function host

1. Open [`functions/hello_world.ts`](https://github.com/anthonychu/azure-functions-deno-template/blob/master/functions/hello_world.ts) to see a basic HTTP triggered function.

1. Then take a look at [`worker.ts`](https://github.com/anthonychu/azure-functions-deno-template/blob/master/worker.ts) to see how the `hello_world` function is added to the Deno Azure Functions worker.

1. Run the app locally:

    ```bash
    denofunc start
    ```

    A folder is generated for the `hello_world` function containing a file named `function.json` that is used by the Azure Functions runtime to load the function (the are ignored in `.gitnore`). The Azure Functions Core Tools (`func`) is then used to run the function app.

1. Open the URL displayed on the screen (http://localhost:7071/api/hello_world) to run the function.

1. `Ctrl-C` to stop the app.

### Deploy the app to Azure

Now that you've run the function app locally, it's time to deploy it to Azure!

1. Configure some variables (examples are in bash):

    ```bash
    region=centralus
    resourceGroupName=<resource_group_name>
    functionAppName=<function_app_name>
    storageName=<storage_name> # must be between 3 and 24 characters in length and may contain numbers and lowercase letters only.
    ```

1. Run these Azure CLI commands to create and configure the function app:

    ```bash
    # Create resource group
    az group create -l $region -n $resourceGroupName

    # Create storage account needed by function app
    az storage account create -n $storageName -l $region -g $resourceGroupName --sku Standard_LRS

    # Create function app
    az functionapp create -n $functionAppName --storage-account $storageName \
        --consumption-plan-location $region -g $resourceGroupName \
        --functions-version 3 --runtime dotnet --os-type Linux

    # Set app settings:
    # - WEBSITE_MOUNT_ENABLED=1 enables squashfs which correctly sets the execute bit on the deno binary
    az functionapp config appsettings set -n $functionAppName -g $resourceGroupName --settings "WEBSITE_MOUNT_ENABLED=1"
    ```

1. Deploy the app:

    ```bash
    denofunc publish $functionAppName
    ```

    Prior to deployment,  `denofunc` tool will download the Deno Linux binary matching your locally installed version of deno that is included with the deployment package.

1. The deployment output will print out the URL of the deployed function. Open to the URL to run your function.

🎉 Congratulations! You've deployed your first Azure Functions app in Deno! 🦕

---

> # Disclaimer
>
> This is not an official Microsoft project and it is not officially supported by Microsoft.