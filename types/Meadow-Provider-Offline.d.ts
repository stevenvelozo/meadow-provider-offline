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
     * Initialize the offline provider.
     *
     * Sets up the SQLite database, Orator IPC, and sub-services.
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
     * @param {object} [pRestClient] - A Fable RestClient instance. If not provided,
     *                                  attempts to use fable.RestClient.
     */
    connect(pRestClient?: object): void;
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
     * Add Create/Update/Delete PostOperation behaviors to track dirty records.
     *
     * These behaviors fire after each IPC CRUD operation and record the
     * mutation in the DirtyRecordTracker.
     *
     * @param {string} pEntityName - The entity name
     * @param {object} pMeadowEndpoints - The MeadowEndpoints instance
     * @private
     */
    private _addDirtyTrackingBehaviors;
}
declare namespace MeadowProviderOffline {
    export { isFableService, serviceType };
}
import libFableServiceBase = require("fable-serviceproviderbase");
declare var isFableService: boolean;
declare const serviceType: "MeadowProviderOffline";
//# sourceMappingURL=Meadow-Provider-Offline.d.ts.map