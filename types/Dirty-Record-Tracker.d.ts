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
 * @typedef {object} BinaryMutation
 * @property {string} entity - The entity name (e.g., "Artifact")
 * @property {number|string} id - The record ID
 * @property {string} blobKey - The BlobStore key (e.g., "Artifact:3:v1")
 * @property {string} mimeType - MIME type of the binary data
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
    /** @type {BinaryMutation[]} */
    _binaryMutations: BinaryMutation[];
    /** @type {Record<string, number>} Maps "Entity:ID" to binary mutation index */
    _binaryDirtyMap: Record<string, number>;
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
     * Clear all mutations (entity and binary).
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
     * Track a binary mutation (media upload that needs syncing).
     *
     * Binary mutations are tracked separately from entity mutations
     * because binary uploads must happen AFTER entity records are
     * synced to the server (to get server-assigned IDs).
     *
     * @param {string} pEntity - Entity name (e.g., "Artifact")
     * @param {number|string} pIDRecord - Record ID
     * @param {string} pBlobKey - BlobStore key (e.g., "Artifact:3:v1")
     * @param {string} pMimeType - MIME type of the binary data
     */
    trackBinaryMutation(pEntity: string, pIDRecord: number | string, pBlobKey: string, pMimeType: string): void;
    /**
     * Get all pending binary mutations.
     *
     * @returns {BinaryMutation[]}
     */
    getBinaryMutations(): BinaryMutation[];
    /**
     * Get binary mutations for a specific entity.
     *
     * @param {string} pEntity - Entity name
     * @returns {BinaryMutation[]}
     */
    getBinaryMutationsForEntity(pEntity: string): BinaryMutation[];
    /**
     * Clear a specific binary mutation after successful sync.
     *
     * @param {string} pEntity - Entity name
     * @param {number|string} pIDRecord - Record ID
     */
    clearBinaryMutation(pEntity: string, pIDRecord: number | string): void;
    /**
     * Check if there are any pending binary mutations.
     *
     * @returns {boolean}
     */
    hasBinaryMutations(): boolean;
    /**
     * Get the count of pending binary mutations.
     *
     * @returns {number}
     */
    getBinaryDirtyCount(): number;
    /**
     * Rebuild the binary dirty map index after array modifications.
     * @private
     */
    private _rebuildBinaryDirtyMap;
    /**
     * Rebuild the dirty map index after array modifications.
     * @private
     */
    private _rebuildDirtyMap;
}
declare namespace DirtyRecordTracker {
    export { isFableService, serviceType, DirtyMutation, BinaryMutation };
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
type BinaryMutation = {
    /**
     * - The entity name (e.g., "Artifact")
     */
    entity: string;
    /**
     * - The record ID
     */
    id: number | string;
    /**
     * - The BlobStore key (e.g., "Artifact:3:v1")
     */
    blobKey: string;
    /**
     * - MIME type of the binary data
     */
    mimeType: string;
    /**
     * - When the mutation occurred
     */
    timestamp: number;
};
//# sourceMappingURL=Dirty-Record-Tracker.d.ts.map