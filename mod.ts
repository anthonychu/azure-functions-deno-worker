import { Application, Router, Context as OakContext } from "https://deno.land/x/oak/mod.ts";
import { AzureFunction, Context, Logger, HttpRequest, HttpMethod } from "./types.ts"

export interface FunctionRegistration {
    func: AzureFunction,
    metadata: any
}

function createLogger(isHttpPassthrough: boolean): Logger {
    const logs: string[] = [];
    const logger: Logger = function (message: string) {
        if (isHttpPassthrough) {
            console.log(message);
        } else {
            logs.push(message);
        }
    }
    logger.logs = logs;
    return logger;
}


class FunctionContext implements Context {
    bindings: { [key: string]: any; } = {};
    bindingData: { [key: string]: any; } = {};
    log: Logger;
    req?: HttpRequest | undefined;
    res?: { [key: string]: any; } | undefined = {
        status: 200
    };

    constructor(isHttpPassthrough = false) {
        this.log = createLogger(isHttpPassthrough);
    }
}

class FunctionHttpRequest implements HttpRequest {
    headers: { [key: string]: string; } = {};
    query: { [key: string]: string; } = {};
    params: { [key: string]: string; } = {};
    body?: any;
    rawBody?: any;

    constructor(public method: HttpMethod | null) {
    }
}

function parseBody(body: { type: string, value: any }) {
    let value = body.value;
    if (body.type === "text") {
        try {
            value = JSON.parse(body.value);
        } catch { }
    }
    return value;
}

function tryJsonParse(input: any) {
    try {
        input = JSON.parse(input);
    } catch {}
    return input;
}

function toCamelCase(input: string) {
    const restOfString: string = input.length > 1 ? input.substring(1) : "";
    return input.substring(0, 1).toLowerCase() + restOfString;
}

function toCamelCaseKeys(input: any) {
    if (typeof(input) === "object") {
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

export class Worker {
    #app: Application;

    constructor(functionRegistrations: FunctionRegistration[]) {
        const router = new Router();

        for (const registration of functionRegistrations) {
            router.all(`/${registration.func.name}`, async (ctx: OakContext) => {
                try {
                    const body = await ctx.request.body();
                    let parsedBody: any = parseBody(body);

                    const isHttpPassthrough: boolean = !(parsedBody.Data && parsedBody.Metadata);
                    const context = new FunctionContext();

                    if (isHttpPassthrough) {
                        // http passthrough
                        const req = new FunctionHttpRequest(ctx.request.method);
                        req.body = parsedBody;
                        req.rawBody = typeof(req.body) === "string" ? req.body : JSON.stringify(req.body);
                        for (const h of ctx.request.headers) {
                            req.headers[h[0]] = h[1];
                        }
                        // TODO: load query and other fields
                        context.req = req;
                    } else {
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
                        console.dir(parsedBody);
                        console.dir(context)
                    }

                    const result = await Promise.resolve(registration.func(context));

                    if (isHttpPassthrough) {
                        const httpOutputBinding = 
                            registration.metadata.bindings.find((b: any) => b.type === "http" && b.direction === "out");
                        
                        let funcResponse: any;
                        if (httpOutputBinding.name === "$return") {
                            if (typeof(result) === "string") {
                                funcResponse = {
                                    status: !!result ? 200 : 204,
                                    body: result
                                }
                            } else {
                                funcResponse = result;
                            }
                        } else {
                            funcResponse = context.res;
                        }
                        
                        ctx.response.status = funcResponse.status;
                        ctx.response.body = funcResponse.body;
                        ctx.response.headers = new Headers();

                        if (funcResponse.headers) {
                            for (const [key, value] of Object.entries(funcResponse.headers)) {
                                ctx.response.headers.set(key as string, value as string);
                            }
                        }
                    } else {
                        ctx.response.body = {
                            Logs: context.log.logs,
                            Outputs: {},
                            ReturnValue: result
                        }
                        ctx.response.headers.set("content-type", "application/json");
                    }
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

    async start() {
        const port = Deno.env.get("FUNCTIONS_HTTPWORKER_PORT") || 8000;
        console.log("listening to port " + port);
        return await this.#app.listen({ port: +port });
    }
}
