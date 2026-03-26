export = MeadowProviderOffline;
/**
 * @class MeadowProviderOffline
 * @extends libFableServiceBase
 */
declare class MeadowProviderOffline extends libFableServiceBase {
    /**
     * @param {object} pFable - The Fable instance
     * @param {object} pOptions - Service options
     * @param {string} pServiceHash - Service hash
     */
    constructor(pFable: object, pOptions: object, pServiceHash: string);
    /**
     * The Data Cache Manager (SQLite management).
     * @type {import('./Data-Cache-Manager.js')|null}
     */
    _DataCacheManager: import("./Data-Cache-Manager.js") | null;
    /**
     * The IPC Orator Manager.
     * @type {import('./IPC-Orator-Manager.js')|null}
     */
    _IPCOratorManager: import("./IPC-Orator-Manager.js") | null;
    /**
     * The RestClient Interceptor.
     * @type {import('./RestClient-Interceptor.js')|null}
     */
    _RestClientInterceptor: import("./RestClient-Interceptor.js") | null;
    /**
     * The Dirty Record Tracker.
     * @type {import('./Dirty-Record-Tracker.js')|null}
     */
    _DirtyRecordTracker: import("./Dirty-Record-Tracker.js") | null;
    /**
     * The Blob Store Manager (IndexedDB binary storage).
     * @type {import('./Blob-Store-Manager.js')|null}
     */
    _BlobStoreManager: import("./Blob-Store-Manager.js") | null;
    /**
     * Registered entities.
     * @type {Record<string, { dal: object, endpoints: object, schema: object }>}
     */
    _Entities: Record<string, {
        dal: object;
        endpoints: object;
        schema: object;
    }>;
    /**
     * Ordered list of entity names.
     * @type {string[]}
     */
    _EntityNames: string[];
    /**
     * Whether the provider is initialized.
     * @type {boolean}
     */
    initialized: boolean;
    /**
     * Native bridge function for routing SQL queries to a native app.
     * When set, the provider uses NativeBridge instead of in-memory
     * SQLite (sql.js), eliminating the need for WASM/asm.js.
     * @type {function|null}
     * @private
     */
    private _nativeBridgeFunction;
    /**
     * Whether negative ID assignment is enabled for offline creates.
     * When true, Create-PreOperation behaviors query MIN(ID) from the
     * entity's SQLite table and assign the next ID below that (or -1
     * if the table has no negative IDs yet).
     * @type {boolean}
     */
    _negativeIDsEnabled: boolean;
    /**
     * Get the Dirty Record Tracker.
     *
     * @returns {import('./Dirty-Record-Tracker.js')|null}
     */
    get dirtyTracker(): import("./Dirty-Record-Tracker.js") | null;
    /**
     * Get the Data Cache Manager.
     *
     * @returns {import('./Data-Cache-Manager.js')|null}
     */
    get dataCacheManager(): import("./Data-Cache-Manager.js") | null;
    /**
     * Get the IPC Orator Manager.
     *
     * @returns {import('./IPC-Orator-Manager.js')|null}
     */
    get ipcOratorManager(): import("./IPC-Orator-Manager.js") | null;
    /**
     * Get the RestClient Interceptor.
     *
     * @returns {import('./RestClient-Interceptor.js')|null}
     */
    get restClientInterceptor(): import("./RestClient-Interceptor.js") | null;
    /**
     * Get the Blob Store Manager.
     *
     * @returns {import('./Blob-Store-Manager.js')|null}
     */
    get blobStore(): import("./Blob-Store-Manager.js") | null;
    /**
     * Get the registered entity names.
     *
     * @returns {string[]}
     */
    get entityNames(): string[];
    /**
     * Get a registered entity by name.
     *
     * @param {string} pEntityName - Entity name
     * @returns {{ dal: object, endpoints: object, schema: object }|undefined}
     */
    getEntity(pEntityName: string): {
        dal: object;
        endpoints: object;
        schema: object;
    } | undefined;
    /**
     * Set a native bridge function for routing SQL queries to a native app.
     *
     * When set (before `initializeAsync()`), the provider skips sql.js /
     * DataCacheManager initialization entirely and instead routes all
     * meadow provider queries through the bridge function to native
     * SQLite. This eliminates the need for WASM or asm.js in the browser.
     *
     * The bridge function signature:
     *   function(pQueryInfo, fCallback)
     *     pQueryInfo: { sql: string, parameters: object, operation: string }
     *     fCallback:  function(pError, pResult)
     *       pResult: { rows: Array, lastInsertRowid: number, changes: number }
     *
     * Call this BEFORE `initializeAsync()`.
     *
     * @param {function} pBridgeFunction - The bridge function
     */
    setNativeBridge(pBridgeFunction: Function): void;
    /**
     * Whether the provider is using a native bridge instead of sql.js.
     *
     * @type {boolean}
     */
    get useNativeBridge(): boolean;
    /**
     * Initialize the offline provider.
     *
     * Sets up the SQLite database (or skips it when using native bridge),
     * Orator IPC, and sub-services.
     * Must be called before addEntity() or connect().
     *
     * Options (from constructor pOptions):
     *   - SessionDataSource {string} - Session data source (default: 'None')
     *   - DefaultSessionObject {object} - Default session object for meadow-endpoints
     *   - MeadowEndpoints {object} - MeadowEndpoints provider URL config
     *
     * @param {function} fCallback - Callback with (pError)
     */
    initializeAsync(fCallback: Function): any;
    /**
     * Apply session configuration to fable settings.
     *
     * Configures meadow-endpoints to bypass session authentication
     * for browser-side IPC operations.
     *
     * @private
     */
    private _applySessionConfig;
    /**
     * Register a Meadow entity.
     *
     * Creates the DAL, sets the SQLite provider, creates MeadowEndpoints,
     * adds dirty-tracking behaviors, creates the SQLite table, and
     * connects routes to the IPC Orator.
     *
     * @param {object} pSchema - Meadow package schema object (with Scope, Schema, etc.)
     * @param {function} [fCallback] - Optional callback with (pError)
     */
    addEntity(pSchema: object, fCallback?: Function): any;
    /**
     * Remove a registered entity.
     *
     * Unregisters URL prefixes and removes from the entity registry.
     * Does NOT drop the SQLite table (use dataCacheManager.dropTable for that).
     *
     * @param {string} pEntityName - The entity name to remove
     */
    removeEntity(pEntityName: string): void;
    /**
     * Register multiple entities in a single batch call.
     *
     * Iterates through the schemas sequentially (createTable is synchronous
     * under the hood) and calls the callback once at the end. Faster than
     * calling addEntity() in a sequential async loop because it avoids
     * per-entity microtask scheduling overhead.
     *
     * @param {Array<object>} pSchemas - Array of Meadow package schema objects
     * @param {function} [fCallback] - Optional callback with (pError)
     */
    addEntities(pSchemas: Array<object>, fCallback?: Function): any;
    /**
     * Seed an entity's SQLite table with records.
     *
     * Clears existing data and inserts the provided records.
     *
     * @param {string} pEntityName - The entity name
     * @param {Array<object>} pRecords - Array of record objects
     * @param {function} [fCallback] - Optional callback
     */
    seedEntity(pEntityName: string, pRecords: Array<object>, fCallback?: Function): any;
    /**
     * Inject records into an entity's SQLite table.
     *
     * Alias for seedEntity(), provided for semantic clarity when
     * data comes from an external source (e.g., a native app wrapper).
     *
     * @param {string} pEntityName - The entity name
     * @param {Array<object>} pRecords - Array of record objects
     * @param {function} [fCallback] - Optional callback
     */
    injectRecords(pEntityName: string, pRecords: Array<object>, fCallback?: Function): any;
    /**
     * Connect the interceptor to a RestClient.
     *
     * After this call, requests matching registered entity URL patterns
     * will be routed through IPC → SQLite instead of HTTP.
     *
     * Optionally connects binary interception on HeadlightRestClient,
     * routing postBinary/getBinaryBlob calls to the BlobStore.
     *
     * @param {object} [pRestClient] - A Fable RestClient instance. If not provided,
     *                                  attempts to use fable.RestClient.
     * @param {object} [pHeadlightRestClient] - Optional HeadlightRestClient instance
     *                                           for binary method interception.
     */
    connect(pRestClient?: object, pHeadlightRestClient?: object): void;
    /**
     * Disconnect the interceptor from the RestClient.
     *
     * Restores the original RestClient behavior.
     *
     * @param {object} [pRestClient] - Optional; if not provided, disconnects the previously connected RestClient
     * @returns {boolean} True if successfully disconnected
     */
    disconnect(pRestClient?: object): boolean;
    /**
     * Enable cache-through mode.
     *
     * When enabled, GET requests that fall through to the network (because
     * the record is not in the local SQLite store) will have their
     * successful responses cached locally. Subsequent requests for the
     * same record will be served from SQLite without hitting the network.
     *
     * Safety: records with pending dirty mutations (local edits not yet
     * synced) are never overwritten by network responses.
     */
    enableCacheThrough(): void;
    /**
     * Disable cache-through mode.
     */
    disableCacheThrough(): void;
    /**
     * Enable negative ID assignment for offline creates.
     *
     * When enabled, new records created via IPC query MIN(ID) from the
     * entity's SQLite table and assign the next ID below that minimum.
     * If the table has no rows or no negative IDs, starts at -1.
     *
     * This handles the case where negative-ID records persist across
     * sessions — on reload, the next create picks up below the existing
     * minimum, avoiding collisions.
     */
    enableNegativeIDs(): void;
    /**
     * Disable negative ID assignment for offline creates.
     *
     * New records will use SQLite AUTOINCREMENT (positive IDs).
     */
    disableNegativeIDs(): void;
    /**
     * Get the next negative ID for an entity by querying MIN(ID) from
     * its SQLite table.
     *
     * Returns min(currentMin, 0) - 1, so:
     *   - Empty table or all-positive IDs → -1
     *   - Table has ID -3 as minimum → -4
     *
     * @param {string} pEntityName - The entity name
     * @param {(pError?: Error, pNextID?: number) => void} fCallback
     * @returns {void} The next negative ID to assign
     */
    getNextNegativeID(pEntityName: string, fCallback: (pError?: Error, pNextID?: number) => void): void;
    /**
     * Remap a record's primary key from an old ID to a new ID.
     *
     * Used after sync: when the server assigns a real positive ID to a
     * record that was created offline with a negative ID, this method
     * updates the local SQLite row and any foreign key references in
     * other registered entity tables.
     *
     * @param {string} pEntityName - The entity whose primary key changed
     * @param {number|string} pOldID - The old (negative) ID
     * @param {number|string} pNewID - The new (server-assigned) ID
     * @returns {number} The number of rows updated across all tables
     */
    remapID(pEntityName: string, pOldID: number | string, pNewID: number | string): number;
    /**
     * Add Create/Update/Delete behaviors to track dirty records and
     * (optionally) assign negative IDs on create.
     *
     * PreOperation behaviors:
     *   - Create-PreOperation: assigns a negative ID when negativeIDs are enabled
     *
     * PostOperation behaviors:
     *   - Create/Update/Delete-PostOperation: track mutations in DirtyRecordTracker
     *
     * @param {string} pEntityName - The entity name
     * @param {object} pMeadowEndpoints - The MeadowEndpoints instance
     * @private
     */
    /**
     * Patch the Update endpoint handler to accept negative IDs.
     *
     * The standard meadow-endpoints Update handler rejects records with
     * ID < 1 (designed for server-side validation). For offline use,
     * records created with negative IDs need to be updatable.
     *
     * This replaces the endpoint's doUpdate function with one that
     * allows non-zero negative IDs, while keeping all other validation
     * and behavior injection intact.
     *
     * @param {object} pMeadowEndpoints - The MeadowEndpoints instance.
     * @private
     */
    /**
     * Patch the Update endpoint handler to accept negative IDs.
     *
     * The standard meadow-endpoints Update handler rejects records with
     * ID < 1 (designed for server-side validation). For offline use,
     * records created with negative IDs need to be updatable.
     *
     * Replaces _Endpoints.Update with a version that accepts non-zero
     * negative IDs while keeping all other validation and behavior
     * injection intact.
     *
     * @param {object} pMeadowEndpoints - The MeadowEndpoints instance.
     * @private
     */
    private _patchUpdateEndpointForNegativeIDs;
    _addDirtyTrackingBehaviors(pEntityName: any, pMeadowEndpoints: any): void;
}
declare namespace MeadowProviderOffline {
    export { isFableService, serviceType };
}
import libFableServiceBase = require("fable-serviceproviderbase");
declare var isFableService: boolean;
declare const serviceType: "MeadowProviderOffline";
//# sourceMappingURL=Meadow-Provider-Offline.d.ts.map