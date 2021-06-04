import { Application, Router, OakContext, Body } from "./worker_deps.ts";
import type {
  AzureFunction,
  HttpMethod,
} from "./types.ts";
import type {
  Context,
  Logger,
  HttpRequest,
} from "./types.ts";

export interface FunctionRegistration {
  name: string;
  handler: AzureFunction;
  metadata?: any;
}

function createLogger(isHttpPassthrough: boolean): Logger {
  const logs: string[] = [];
  const logger: Logger = function (message: string) {
    if (isHttpPassthrough) {
      console.log(message);
    } else {
      logs.push(message);
    }
  };
  logger.logs = logs;
  return logger;
}

class FunctionContext implements Context {
  bindings: { [key: string]: any } = {};
  bindingData: { [key: string]: any } = {};
  log: Logger;
  req?: HttpRequest | undefined;
  res?: { [key: string]: any } | undefined = {
    status: 200,
  };

  constructor(isHttpPassthrough = false) {
    this.log = createLogger(isHttpPassthrough);
  }
}

class FunctionHttpRequest implements HttpRequest {
  headers: { [key: string]: string } = {};
  query: { [key: string]: string } = {};
  params: { [key: string]: string } = {};
  body?: any;
  rawBody?: any;

  constructor(public method: HttpMethod | null) {
  }
}

async function parseBody(body: { type: string; value: any }) {
  let value = await body.value;
  if (body.type === "text") {
    try {
      value = JSON.parse(value);
    } catch { }
  }
  return value;
}

function tryJsonParse(input: any) {
  try {
    input = JSON.parse(input);
  } catch { }
  return input;
}

function toCamelCase(input: string) {
  const restOfString: string = input.length > 1 ? input.substring(1) : "";
  return input.substring(0, 1).toLowerCase() + restOfString;
}

function toCamelCaseKeys(input: any) {
  if (typeof (input) === "object") {
    for (const [key, value] of Object.entries(input)) {
      const firstChar = key.substring(0, 1);
      if (firstChar !== firstChar.toLowerCase()) {
        const restOfString = key.length > 1 ? key.substring(1) : "";
        input[firstChar.toLowerCase() + restOfString] = value;
        delete input[key];
      }
    }
  }
}

export class AzureFunctionsWorker {
  #app: Application;
  #functionRegistrations: FunctionRegistration[];

  constructor(functionRegistrations: FunctionRegistration[]) {
    this.#functionRegistrations = functionRegistrations;

    // check if a function name is already used in another function
    const funcNames:string[] = [];
    this.#functionRegistrations.forEach((funcReg) => {
      if (funcNames.includes(funcReg.name)) 
        throw new Error(
          `A function name \`${funcReg.name}\` is already used in another function. Make sure each function name.`
        );
      funcNames.push(funcReg.name);
    });

    const router = new Router();

    for (const registration of functionRegistrations) {
      if (!registration.metadata) {
        registration.metadata = getDefaultFunctionMetadata();
      }
      router.all(`/${registration.name}`, async (ctx: OakContext) => {
        try {
          let body: Body;

          try {
            body = await ctx.request.body();
          } catch {
            body = {
              type: "undefined",
              value: undefined,
            };
          }

          let parsedBody: any = await parseBody(body);

          const isHttpPassthrough: boolean = parsedBody === undefined ||
            !(parsedBody.Data && parsedBody.Metadata);
          const context = new FunctionContext();

          // lots of stuff need camelcasing
          // TODO: refactor
          parsedBody.Metadata.sys = tryJsonParse(parsedBody.Metadata.sys);
          toCamelCaseKeys(parsedBody.Metadata.sys);
          toCamelCaseKeys(parsedBody.Data.req);

          context.req = parsedBody.Data.req;
          for (const [key, value] of Object.entries(parsedBody.Data)) {
            context.bindings[toCamelCase(key)] = tryJsonParse(value);
          }
          for (const [key, value] of Object.entries(parsedBody.Metadata)) {
            context.bindingData[toCamelCase(key)] = tryJsonParse(value);
          }

          const result = await Promise.resolve(registration.handler(context));

          // Merge `context.res` into `context.bindings`
          // `context.res` is the special property for HTTP response
          // https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#response-object
          if (context.res) context.bindings.res = context.res;

          ctx.response.body = {
            Logs: context.log.logs,
            Outputs: context.bindings,
            ReturnValue: result,
          };
          ctx.response.headers.set("content-type", "application/json");
        } catch (ex) {
          console.error(ex);
          ctx.response.status = 500;
        }
      });
    }

    const app = new Application();

    app.use(router.routes());
    app.use(router.allowedMethods());

    this.#app = app;
  }

  async run() {
    if (Deno.env.get("DENOFUNC_GENERATE")) {
      await this.regenerateFunctions();
    } else {
      const port = Deno.env.get("FUNCTIONS_HTTPWORKER_PORT") || 8000;
      console.log("listening to port " + port);
      return await this.#app.listen({ port: +port });
    }
  }

  private async regenerateFunctions() {
    console.info("Cleaning function folders...");
    for await (const dirEntry of Deno.readDir(".")) {
      if (dirEntry.isDirectory) {
        let hasFunctionJson, hasOtherThings = false;
        for await (const subdirEntry of Deno.readDir(dirEntry.name)) {
          if (subdirEntry.isFile && subdirEntry.name === "function.json") {
            hasFunctionJson = true;
          } else {
            hasOtherThings = true;
          }
        }

        if (hasFunctionJson && hasOtherThings) {
          console.warn(
            `Folder ${dirEntry.name} contains functions.json but also has other files. Delete skipped.`,
          );
        } else if (hasFunctionJson) {
          console.info(`Deleting folder ${dirEntry.name}.`);
          await Deno.remove(dirEntry.name, { recursive: true });
        }
      }
    }

    console.info("Generating function folders...");
    for (const func of this.#functionRegistrations) {
      try {
        await Deno.mkdir(func.name);
      } catch { }
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(func.metadata, null, 2));
      console.info(`Generating file ${func.name}/function.json.`);
      await Deno.writeFile(`${func.name}/function.json`, data);
    }
  }
}

function getDefaultFunctionMetadata() {
  return {
    "bindings": [
      {
        "type": "httpTrigger",
        "authLevel": "anonymous",
        "direction": "in",
        "methods": [
          "GET",
          "POST",
        ],
        "name": "req",
      },
      {
        "type": "http",
        "direction": "out",
        "name": "res",
      },
    ],
  };
}
