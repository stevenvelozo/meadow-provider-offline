export = IPCOratorManager;
/**
 * @class IPCOratorManager
 * @extends libFableServiceBase
 */
declare class IPCOratorManager extends libFableServiceBase {
    /**
     * @param {object} pFable - The Fable instance
     * @param {object} pOptions - Service options
     * @param {string} pServiceHash - Service hash
     */
    constructor(pFable: object, pOptions: object, pServiceHash: string);
    /**
     * The Orator IPC instance.
     * @type {object|null}
     */
    _Orator: object | null;
    /**
     * Whether Orator is initialized and started.
     * @type {boolean}
     */
    _started: boolean;
    /**
     * Get the Orator IPC instance.
     *
     * @returns {object|null}
     */
    get orator(): object | null;
    /**
     * Get the Orator service server.
     *
     * @returns {object|null}
     */
    get serviceServer(): object | null;
    /**
     * Whether the IPC Orator is running.
     *
     * @returns {boolean}
     */
    get started(): boolean;
    /**
     * Initialize and start the Orator IPC instance.
     *
     * Sets up:
     *   1. Orator in IPC mode (auto-selected in browser)
     *   2. Pre-behavior function for body injection + response method patching
     *   3. Route guarding on invoke() for missing routes
     *   4. Starts the IPC "server" (no-op for IPC but sets Active = true)
     *
     * @param {function} fCallback - Callback with (pError)
     */
    initializeAsync(fCallback: Function): any;
    /**
     * Stage body data for the next IPC invoke() call.
     *
     * The pre-behavior function will inject this into pRequest.body
     * and then clear it, so it's consumed exactly once.
     *
     * @param {object} pBody - The body data to stage
     */
    stageBodyData(pBody: object): void;
    /**
     * Connect meadow-endpoints routes to the IPC service server.
     *
     * @param {object} pMeadowEndpoints - A MeadowEndpoints instance
     */
    connectEntityRoutes(pMeadowEndpoints: object): void;
}
declare namespace IPCOratorManager {
    export { isFableService, serviceType };
}
import libFableServiceBase = require("fable-serviceproviderbase");
declare var isFableService: boolean;
declare const serviceType: "IPCOratorManager";
//# sourceMappingURL=IPC-Orator-Manager.d.ts.map