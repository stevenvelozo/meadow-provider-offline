export = DirtyRecordTracker;
/**
 * @typedef {object} DirtyMutation
 * @property {string} entity - The entity name (e.g., "Book")
 * @property {number|string} id - The record ID
 * @property {string} operation - The operation type: 'create', 'update', 'delete'
 * @property {object} record - The full record data at time of mutation
 * @property {number} timestamp - When the mutation occurred
 */
/**
 * @class DirtyRecordTracker
 * @extends libFableServiceBase
 */
declare class DirtyRecordTracker extends libFableServiceBase {
    /**
     * @param {object} pFable - The Fable instance
     * @param {object} pOptions - Service options
     * @param {string} pServiceHash - Service hash
     */
    constructor(pFable: object, pOptions: object, pServiceHash: string);
    /** @type {DirtyMutation[]} */
    _mutations: DirtyMutation[];
    /** @type {Record<string, number>} Maps "Entity:ID" to mutation index */
    _dirtyMap: Record<string, number>;
    /**
     * Track a local mutation.
     *
     * @param {string} pEntity - Entity name
     * @param {number|string} pIDRecord - Record ID
     * @param {string} pOperation - 'create', 'update', or 'delete'
     * @param {object} pRecord - The record data
     */
    trackMutation(pEntity: string, pIDRecord: number | string, pOperation: string, pRecord: object): void;
    /**
     * Get all pending dirty mutations.
     *
     * @returns {DirtyMutation[]}
     */
    getDirtyMutations(): DirtyMutation[];
    /**
     * Get the count of pending dirty mutations.
     *
     * @returns {number}
     */
    getDirtyCount(): number;
    /**
     * Get dirty mutations for a specific entity.
     *
     * @param {string} pEntity - Entity name
     * @returns {DirtyMutation[]}
     */
    getDirtyMutationsForEntity(pEntity: string): DirtyMutation[];
    /**
     * Clear a specific mutation after successful sync.
     *
     * @param {string} pEntity - Entity name
     * @param {number|string} pIDRecord - Record ID
     */
    clearMutation(pEntity: string, pIDRecord: number | string): void;
    /**
     * Clear all mutations for a specific entity.
     *
     * @param {string} pEntity - Entity name
     */
    clearEntity(pEntity: string): void;
    /**
     * Clear all mutations.
     */
    clearAll(): void;
    /**
     * Check if there are any dirty records.
     *
     * @returns {boolean}
     */
    hasDirtyRecords(): boolean;
    /**
     * Check if a specific entity has dirty records.
     *
     * @param {string} pEntity - Entity name
     * @returns {boolean}
     */
    hasEntityDirtyRecords(pEntity: string): boolean;
    /**
     * Rebuild the dirty map index after array modifications.
     * @private
     */
    private _rebuildDirtyMap;
}
declare namespace DirtyRecordTracker {
    export { isFableService, serviceType, DirtyMutation };
}
import libFableServiceBase = require("fable-serviceproviderbase");
declare var isFableService: boolean;
declare const serviceType: "DirtyRecordTracker";
type DirtyMutation = {
    /**
     * - The entity name (e.g., "Book")
     */
    entity: string;
    /**
     * - The record ID
     */
    id: number | string;
    /**
     * - The operation type: 'create', 'update', 'delete'
     */
    operation: string;
    /**
     * - The full record data at time of mutation
     */
    record: object;
    /**
     * - When the mutation occurred
     */
    timestamp: number;
};
//# sourceMappingURL=Dirty-Record-Tracker.d.ts.map