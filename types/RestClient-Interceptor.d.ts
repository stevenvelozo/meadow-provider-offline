export = RestClientInterceptor;
/**
 * @class RestClientInterceptor
 * @extends libFableServiceBase
 */
declare class RestClientInterceptor extends libFableServiceBase {
    /**
     * @param {object} pFable - The Fable instance
     * @param {object} pOptions - Service options
     * @param {string} pServiceHash - Service hash
     */
    constructor(pFable: object, pOptions: object, pServiceHash: string);
    /**
     * The original executeJSONRequest function, stashed for restore.
     * @type {function|null}
     */
    _originalExecuteJSONRequest: Function | null;
    /**
     * The original executeChunkedRequest function, stashed for restore.
     * @type {function|null}
     */
    _originalExecuteChunkedRequest: Function | null;
    /**
     * The RestClient instance we are connected to.
     * @type {object|null}
     */
    _connectedRestClient: object | null;
    /**
     * The IPC Orator Manager for routing intercepted requests.
     * @type {object|null}
     */
    _IPCOratorManager: object | null;
    /**
     * Registered URL prefixes that should be intercepted.
     * Each entry maps an entity endpoint prefix to true.
     * @type {Record<string, boolean>}
     */
    _registeredPrefixes: Record<string, boolean>;
    /**
     * Register a URL prefix for interception.
     *
     * When a request URL path starts with this prefix, it will be
     * routed through IPC instead of HTTP.
     *
     * @param {string} pPrefix - URL path prefix (e.g., '/1.0/Book')
     */
    registerPrefix(pPrefix: string): void;
    /**
     * Unregister a URL prefix.
     *
     * @param {string} pPrefix - URL path prefix to unregister
     */
    unregisterPrefix(pPrefix: string): void;
    /**
     * Check if a URL should be intercepted.
     *
     * Extracts the pathname from the URL and checks if it starts with
     * any registered prefix.
     *
     * @param {string} pURL - The request URL
     * @returns {boolean} True if the URL should be intercepted
     */
    shouldIntercept(pURL: string): boolean;
    /**
     * Resolve the URL to a pathname by stripping any absolute URL prefix.
     *
     * Handles URLs like 'http://localhost:8086/1.0/Books/0/10' → '/1.0/Books/0/10'
     *
     * @param {string} pURL - The URL to resolve
     * @returns {string} The pathname portion of the URL
     * @private
     */
    private _resolveURL;
    /**
     * Parse the IPC response into the format expected by RestClient consumers.
     *
     * Converts the IPC synthesized response into a { statusCode, body } format
     * that matches what simple-get returns, ensuring compatibility with all
     * existing RestClient consumers (PictMeadowEntityProvider, etc.).
     *
     * @param {Error|null} pError - Error from IPC invoke
     * @param {string|object} pResponseData - Response data from IPC
     * @param {object} pSynthesizedResponse - The IPC synthesized response object
     * @param {function} fCallback - Callback with (error, response, body)
     * @param {boolean} pParseJSON - Whether to JSON.parse the response data
     * @private
     */
    private _handleIPCResponse;
    /**
     * Connect to a RestClient, wrapping executeJSONRequest and
     * executeChunkedRequest with interception logic.
     *
     * @param {object} pRestClient - A Fable RestClient service instance
     * @param {object} pIPCOratorManager - The IPC Orator Manager instance
     */
    connect(pRestClient: object, pIPCOratorManager: object): void;
    /**
     * Disconnect from the previously connected RestClient.
     *
     * Restores the original executeJSONRequest and executeChunkedRequest
     * functions.
     *
     * @param {object} [pRestClient] - Optional; if not provided, disconnects the previously connected RestClient
     * @returns {boolean} True if successfully disconnected
     */
    disconnect(pRestClient?: object): boolean;
}
declare namespace RestClientInterceptor {
    export { isFableService, serviceType };
}
import libFableServiceBase = require("fable-serviceproviderbase");
declare var isFableService: boolean;
declare const serviceType: "RestClientInterceptor";
//# sourceMappingURL=RestClient-Interceptor.d.ts.map