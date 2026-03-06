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
     * The HeadlightRestClient instance we are binary-connected to.
     * @type {object|null}
     */
    _connectedHeadlightRestClient: object | null;
    /**
     * The original postBinary function, stashed for restore.
     * @type {function|null}
     */
    _originalPostBinary: Function | null;
    /**
     * The original getBinaryBlob function, stashed for restore.
     * @type {function|null}
     */
    _originalGetBinaryBlob: Function | null;
    /**
     * The BlobStoreManager for binary storage.
     * @type {object|null}
     */
    _BlobStore: object | null;
    /**
     * The DirtyRecordTracker for binary mutation tracking.
     * @type {object|null}
     */
    _DirtyTracker: object | null;
    /**
     * Additional RestClient instances that have been wrapped.
     * Each entry stores { restClient, originalExecuteJSONRequest, originalExecuteChunkedRequest }.
     * @type {Array<{ restClient: object, originalExecuteJSONRequest: function, originalExecuteChunkedRequest: function }>}
     */
    _additionalRestClients: Array<{
        restClient: object;
        originalExecuteJSONRequest: Function;
        originalExecuteChunkedRequest: Function;
    }>;
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
     * Normalize a URL for IPC route matching.
     *
     * Resolves the URL to a pathname and strips any trailing slash.
     * Meadow-endpoints registers routes without trailing slashes
     * (e.g., PUT /1.0/Document) but some clients send URLs with
     * trailing slashes (e.g., PUT /1.0/Document/).
     *
     * @param {string} pURL - The URL to normalize
     * @returns {string} Normalized pathname suitable for IPC invoke
     * @private
     */
    private _normalizeRouteURL;
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
     * Connect an additional RestClient for interception.
     *
     * Some services (e.g., HeadlightRestClient) maintain their own
     * internal RestClient instance separate from fable.RestClient.
     * This method wraps that additional RestClient with the same
     * interception logic so all HTTP calls through it are also routed
     * through IPC when matching registered prefixes.
     *
     * Must be called after connect() — requires _IPCOratorManager to be set.
     *
     * @param {object} pRestClient - An additional Fable RestClient service instance
     */
    connectAdditionalRestClient(pRestClient: object): void;
    /**
     * Disconnect from the previously connected RestClient.
     *
     * Restores the original executeJSONRequest and executeChunkedRequest
     * functions. Also disconnects binary interception and additional
     * RestClients if connected.
     *
     * @param {object} [pRestClient] - Optional; if not provided, disconnects the previously connected RestClient
     * @returns {boolean} True if successfully disconnected
     */
    disconnect(pRestClient?: object): boolean;
    /**
     * Connect binary interception to a HeadlightRestClient.
     *
     * Wraps postBinary() and getBinaryBlob() on the HeadlightRestClient
     * to intercept matching URLs and route them to the BlobStore instead
     * of making network requests.
     *
     * This is separate from connect() to keep the existing JSON interception
     * on the Fable RestClient unchanged.
     *
     * @param {object} pHeadlightRestClient - HeadlightRestClient with postBinary/getBinaryBlob methods
     * @param {object} pBlobStoreManager - BlobStoreManager instance for IndexedDB storage
     * @param {object} pDirtyRecordTracker - DirtyRecordTracker instance for mutation tracking
     */
    connectBinary(pHeadlightRestClient: object, pBlobStoreManager: object, pDirtyRecordTracker: object): void;
    /**
     * Disconnect binary interception from HeadlightRestClient.
     *
     * Restores the original postBinary and getBinaryBlob functions.
     *
     * @returns {boolean} True if successfully disconnected
     */
    disconnectBinary(): boolean;
    /**
     * Parse a binary media URL to extract entity type, ID, and version.
     *
     * Handles URLs like:
     *   /1.0/Artifact/Media/{IDArtifact}/{Version}
     *   http://server/1.0/Artifact/Media/123/1
     *
     * @param {string} pURL - The full or relative URL
     * @returns {{ entity: string, id: string|number, version: string|number }|null}
     * @private
     */
    private _parseBinaryURL;
}
declare namespace RestClientInterceptor {
    export { isFableService, serviceType };
}
import libFableServiceBase = require("fable-serviceproviderbase");
declare var isFableService: boolean;
declare const serviceType: "RestClientInterceptor";
//# sourceMappingURL=RestClient-Interceptor.d.ts.map