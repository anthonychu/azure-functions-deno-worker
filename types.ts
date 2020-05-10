/**
 * Interface for your Azure Function code. This function must be exported (via module.exports or exports)
 * and will execute when triggered. It is recommended that you declare this function as async, which
 * implicitly returns a Promise.
 * @param context Context object passed to your function from the Azure Functions runtime.
 * @param {any[]} args Optional array of input and trigger binding data. These binding data are passed to the
 * function in the same order that they are defined in function.json. Valid input types are string, HttpRequest,
 * and Buffer.
 * @returns Output bindings (optional). If you are returning a result from a Promise (or an async function), this
 * result will be passed to JSON.stringify unless it is a string, Buffer, ArrayBufferView, or number.
 */
export declare type AzureFunction = ((context: Context, ...args: any[]) => Promise<any> | void | any);
/**
 * The context object can be used for writing logs, reading data from bindings, setting outputs and using
 * the context.done callback when your exported function is synchronous. A context object is passed
 * to your function from the Azure Functions runtime on function invocation.
 */
export interface Context {
    // /**
    //  * A unique GUID per function invocation.
    //  */
    // invocationId: string;
    // /**
    //  * Function execution metadata.
    //  */
    // executionContext: ExecutionContext;
    /**
     * Input and trigger binding data, as defined in function.json. Properties on this object are dynamically
     * generated and named based off of the "name" property in function.json.
     */
    bindings: {
        [key: string]: any;
    };
    /**
     * Trigger metadata and function invocation data.
     */
    bindingData: {
        [key: string]: any;
    };
    // /**
    //  * TraceContext information to enable distributed tracing scenarios.
    //  */
    // traceContext: TraceContext;
    // /**
    //  * Bindings your function uses, as defined in function.json.
    //  */
    // bindingDefinitions: BindingDefinition[];
    /**
     * Allows you to write streaming function logs. Calling directly allows you to write streaming function logs
     * at the default trace level.
     */
    log: Logger;
    /**
     * HTTP request object. Provided to your function when using HTTP Bindings.
     */
    req?: HttpRequest;
    /**
     * HTTP response object. Provided to your function when using HTTP Bindings.
     */
    res?: {
        [key: string]: any;
    };
}
/**
 * HTTP request object. Provided to your function when using HTTP Bindings.
 */
export interface HttpRequest {
    /**
     * HTTP request method used to invoke this function.
     */
    method: HttpMethod | null;
    // /**
    //  * Request URL.
    //  */
    // url: string;
    /**
     * HTTP request headers.
     */
    headers: {
        [key: string]: string;
    };
    /**
     * Query string parameter keys and values from the URL.
     */
    query: {
        [key: string]: string;
    };
    /**
     * Route parameter keys and values.
     */
    params: {
        [key: string]: string;
    };
    /**
     * The HTTP request body.
     */
    body?: any;
    /**
     * The HTTP request body as a UTF-8 string.
     */
    rawBody?: any;
}
/**
 * Possible values for an HTTP request method.
 */
export declare type HttpMethod = "GET" | "POST" | "DELETE" | "HEAD" | "PATCH" | "PUT" | "OPTIONS" | "TRACE" | "CONNECT";
/**
 * Http response cookie object to "Set-Cookie"
 */
export interface Cookie {
    /** Cookie name */
    name: string;
    /** Cookie value */
    value: string;
    /** Specifies allowed hosts to receive the cookie */
    domain?: string;
    /** Specifies URL path that must exist in the requested URL */
    path?: string;
    /**
     * NOTE: It is generally recommended that you use maxAge over expires.
     * Sets the cookie to expire at a specific date instead of when the client closes.
     * This can be a Javascript Date or Unix time in milliseconds.
     */
    expires?: Date | number;
    /** Sets the cookie to only be sent with an encrypted request */
    secure?: boolean;
    /** Sets the cookie to be inaccessible to JavaScript's Document.cookie API */
    httpOnly?: boolean;
    /** Can restrict the cookie to not be sent with cross-site requests */
    sameSite?: "Strict" | "Lax" | undefined;
    /** Number of seconds until the cookie expires. A zero or negative number will expire the cookie immediately. */
    maxAge?: number;
}
export interface ExecutionContext {
    /**
     * A unique GUID per function invocation.
     */
    invocationId: string;
    /**
     * The name of the function that is being invoked. The name of your function is always the same as the
     * name of the corresponding function.json's parent directory.
     */
    functionName: string;
    /**
     * The directory your function is in (this is the parent directory of this function's function.json).
     */
    functionDirectory: string;
}
/**
 * TraceContext information to enable distributed tracing scenarios.
 */
export interface TraceContext {
    /** Describes the position of the incoming request in its trace graph in a portable, fixed-length format. */
    traceparent: string | null | undefined;
    /** Extends traceparent with vendor-specific data. */
    tracestate: string | null | undefined;
    /** Holds additional properties being sent as part of request telemetry. */
    attributes: {
        [k: string]: string;
    } | null | undefined;
}
export interface BindingDefinition {
    /**
     * The name of your binding, as defined in function.json.
     */
    name: string;
    /**
     * The type of your binding, as defined in function.json.
     */
    type: string;
    /**
     * The direction of your binding, as defined in function.json.
     */
    direction: 'in' | 'out' | 'inout' | undefined;
}
/**
 * Allows you to write streaming function logs.
 */
export interface Logger {
    /**
     * Writes streaming function logs at the default trace level.
     */
    (message: string): void;
    // /**
    //  * Writes to error level logging or lower.
    //  */
    // error(...args: any[]): void;
    // /**
    //  * Writes to warning level logging or lower.
    //  */
    // warn(...args: any[]): void;
    // /**
    //  * Writes to info level logging or lower.
    //  */
    // info(...args: any[]): void;
    // /**
    //  * Writes to verbose level logging.
    //  */
    // verbose(...args: any[]): void;
    logs: string[];
}