import { Application, Router, Context } from "https://deno.land/x/oak/mod.ts";
import { AzureFunction } from "./types.ts"

export interface FunctionRegistration {
    func: AzureFunction,
    metadata: any
}

export class Worker {
    #app: Application;

    constructor(functionRegistrations: FunctionRegistration[]) {
        const router = new Router();

        for (const registration of functionRegistrations) {
            router.all(`/${registration.func.name}`, async (ctx: Context) => {
                try {
                    const body = await ctx.request.body();
                    let parsedBody: any = body.value;
                    if (body.type === "text") {
                        try {
                            parsedBody = JSON.parse(body.value);
                        } catch { }
                    }
                    console.dir(parsedBody);
                    ctx.response.body = `Welcome to deno ${Deno.version.deno} 🦕 in Azure Functions 🌩\n\n
                        ${registration.func.name}
                        ${JSON.stringify(parsedBody)}
                    `;
                } catch (ex) {
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
