# Deno for Azure Functions

```
           @@@@@@@@@@@,         
       @@@@@@@@@@@@@@@@@@@                        %%%%%%
     @@@@@@        @@@@@@@@@@                    %%%%%%
   @@@@@ @  @           *@@@@@              @   %%%%%%    @
   @@@                    @@@@@           @@   %%%%%%      @@
  @@@@@                   @@@@@        @@@    %%%%%%%%%%%    @@@
  @@@@@@@@@@@@@@@          @@@@      @@      %%%%%%%%%%        @@
   @@@@@@@@@@@@@@          @@@@        @@         %%%%       @@
    @@@@@@@@@@@@@@         @@@           @@      %%%       @@
     @@@@@@@@@@@@@         @               @@    %%      @@
       @@@@@@@@@@@                              %%
            @@@@@@@                             %
```

## Overview

<p>
    <a href="https://online.visualstudio.com/environments/new?name=Deno%20Azure%20Functions&repo=anthonychu/azure-functions-deno-template">
        <img src="https://img.shields.io/endpoint?url=https%3A%2F%2Faka.ms%2Fvso-badge">
    </a>
</p>

This is a worker that lets you run Deno on [Azure Functions](https://docs.microsoft.com/azure/azure-functions/functions-overview). It is implemented as an [Azure Functions Custom Handler](https://docs.microsoft.com/azure/azure-functions/functions-custom-handlers) and runs on the Azure Functions Consumption (serverless) plan.

The project includes a CLI `denofunc` to make it easy to create, run, and deploy your Deno Azure Functions apps.

### 3 commands to get started

```bash
# initialize function app
denofunc init

# run function app locally
denofunc start

# deploy the app
denofunc publish $functionAppName [--slot $slotName] [--allow-run] [--allow-write]
```

For more information, try the [quickstart](#getting-started) below.

### Programming model

All Azure Functions [triggers and bindings](https://docs.microsoft.com/azure/azure-functions/functions-triggers-bindings) (including custom bindings) are supported.

In this simplified programming model, each function is a single file. Here are a couple of examples:
* [HTTP trigger](https://github.com/anthonychu/azure-functions-deno-template/blob/main/functions/hello_world.ts)
* [Queue trigger](https://github.com/anthonychu/azure-functions-deno-template/blob/main/functions/queue_trigger.ts)

Check out the [new project template](https://github.com/anthonychu/azure-functions-deno-template) for the entire app structure.

## Getting started - building a Deno function app

### Requirements

* Linux, macOS, Windows
* [Deno](https://deno.land/x/install/)
    - Tested on:
        - `1.16.2`
* [Azure Functions Core Tools V3](https://github.com/Azure/azure-functions-core-tools#azure-functions-core-tools) - needed for running the app locally and deploying it
* [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli?view=azure-cli-latest#install) - needed to deploy the app
* `denofunc` CLI - see [below](#install-the-denofunc-cli)

> #### Codespaces
>
> You can also get a preconfigured, cloud-based dev environment from Codespaces:
> 
> * **Visual Studio Codespaces** - [click to create](https://online.visualstudio.com/environments/new?name=Deno%20Azure%20Functions&repo=anthonychu/azure-functions-deno-template)
> * **GitHub Codespaces** ([private preview](https://github.com/features/codespaces)) - [go to the template repo](https://github.com/anthonychu/azure-functions-deno-template) and create a Codespace

#### Install the denofunc CLI

To help create, run, and deploy a Deno for Azure Functions app, you need to install the `denofunc` CLI. `denofunc` wraps the Azure Functions Core Tools (`func`) and is used for generating artifacts required to run/deploy the app.

To install the CLI, run the following Deno command.

```bash
deno install --allow-run --allow-read --allow-write --allow-net --unstable --force \
    --name=denofunc https://raw.githubusercontent.com/anthonychu/azure-functions-deno-worker/v0.9.0/denofunc.ts
```

Confirm it is installed correctly:

```bash
denofunc --help
```

### Create and run an app locally

1. Create and change into an empty folder.

1. Initialize the project:

    ```bash
    denofunc init
    ```

    A few of the files that are important to know about:
    - [`functions/hello_world.ts`](https://github.com/anthonychu/azure-functions-deno-template/blob/main/functions/hello_world.ts) - a basic HTTP triggered function
    - [`worker.ts`](https://github.com/anthonychu/azure-functions-deno-template/blob/main/worker.ts) - the Deno worker used by Azure Functions
    - [`host.json`](https://github.com/anthonychu/azure-functions-deno-template/blob/main/host.json) - configuration of the function host

1. Run the app locally:

    ```bash
    denofunc start
    ```

    The Azure Functions Core Tools (`func`) is then called to run the function app.

    > Note: A folder is automatically generated for the `hello_world` function containing a file named `function.json` that is used by the Azure Functions runtime to load the function (they are ignored in `.gitnore`).

1. Open the URL displayed on the screen (http://localhost:7071/api/hello_world) to run the function.

1. `Ctrl-C` to stop the app.

### Deploy the app to Azure

Now that you've run the function app locally, it's time to deploy it to Azure!

1. Configure some variables (examples are in bash):

    ```bash
    region=centralus # any region where Linux Azure Functions are available
    resourceGroupName=<resource_group_name>
    functionAppName=<function_app_name>
    storageName=<storage_name> # must be between 3 and 24 characters in length and may contain numbers and lowercase letters only.
    ```

1. If you are not authenticated with the Azure CLI, log in.

    ```bash
    # Log in to the Azure CLI
    az login
    ```

    This might not work in some environments (e.g. Codespaces). Try `az login --use-device-code` instead.

1. Run these Azure CLI commands to create and configure the function app:

    ```bash
    # Create resource group
    az group create -l $region -n $resourceGroupName

    # Create storage account needed by function app
    az storage account create -n $storageName -l $region -g $resourceGroupName --sku Standard_LRS

    # Create function app (also works on Windows)
    az functionapp create -n $functionAppName --storage-account $storageName \
        --consumption-plan-location $region -g $resourceGroupName \
        --functions-version 3 --runtime dotnet --os-type Linux
    ```

1. Deploy the app:

    ```bash
    denofunc publish $functionAppName
    ```

    Prior to deployment,  `denofunc` tool will download the Deno Linux binary matching your locally installed version of deno that is included with the deployment package.

1. The deployment output will print out the URL of the deployed function. Open to the URL to run your function.

### 🎉 Congratulations!

You've deployed your first Azure Functions app in Deno! 🦕

---

*Disclaimer: This is a community open source project. No official support is provided by Microsoft.*
