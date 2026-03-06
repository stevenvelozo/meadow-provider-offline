export = BlobStoreManager;
/**
 * @typedef {object} BlobMetadata
 * @property {string} mimeType - MIME type of the blob
 * @property {string} fileName - Original file name
 * @property {number} size - Size in bytes
 * @property {string} entityType - Entity type (e.g., 'Artifact')
 * @property {number|string} entityID - Entity record ID
 * @property {number|string} version - Entity version
 * @property {string} createdAt - ISO 8601 timestamp
 */
/**
 * @typedef {object} BlobEntry
 * @property {Blob} blob - The binary data
 * @property {BlobMetadata} metadata - Associated metadata
 */
/**
 * @class BlobStoreManager
 * @extends libFableServiceBase
 */
declare class BlobStoreManager extends libFableServiceBase {
    /**
     * @param {object} pFable - The Fable instance
     * @param {object} pOptions - Service options
     * @param {string} pServiceHash - Service hash
     */
    constructor(pFable: object, pOptions: object, pServiceHash: string);
    /**
     * The IndexedDB database handle.
     * @type {IDBDatabase|null}
     * @private
     */
    private _db;
    /**
     * Whether the BlobStore is initialized.
     * @type {boolean}
     */
    initialized: boolean;
    /**
     * Map of active Object URLs for revocation.
     * @type {Map<string, string>}
     * @private
     */
    private _objectURLs;
    /**
     * Whether the BlobStore is running in degraded (no-op) mode.
     *
     * When IndexedDB is not available (e.g., Node.js test environment),
     * the BlobStore initializes successfully but all storage operations
     * return empty/null results instead of errors.
     *
     * @type {boolean}
     */
    get degraded(): boolean;
    /**
     * Initialize the IndexedDB database.
     *
     * Opens (or creates) the `meadow-offline-blobs` database with a
     * `blobs` object store keyed by string keys.
     *
     * In environments where IndexedDB is not available (e.g., Node.js),
     * initializes in degraded mode — all operations succeed as no-ops.
     *
     * @param {(pError?: Error) => void} fCallback - Callback with (pError)
     */
    initializeAsync(fCallback: (pError?: Error) => void): void;
    /**
     * Store a blob with metadata.
     *
     * @param {string} pKey - Storage key (e.g., `Artifact:3:v1`)
     * @param {Blob|File|ArrayBuffer} pBlobData - The binary data
     * @param {BlobMetadata} pMetadata - Metadata about the blob
     * @param {(pError?: Error) => void} fCallback - Callback with (pError)
     */
    storeBlob(pKey: string, pBlobData: Blob | File | ArrayBuffer, pMetadata: BlobMetadata, fCallback: (pError?: Error) => void): void;
    /**
     * Retrieve a blob and its metadata.
     *
     * @param {string} pKey - Storage key
     * @param {(pError?: Error, pBlobEntry?: { blob: Blob, metadata: BlobMetadata }) => void} fCallback - Callback with (pError, pBlobEntry)
     */
    getBlob(pKey: string, fCallback: (pError?: Error, pBlobEntry?: {
        blob: Blob;
        metadata: BlobMetadata;
    }) => void): void;
    /**
     * Get an Object URL for a stored blob.
     *
     * Creates a `blob:` URL that can be used in `<img>`, `<video>`, or
     * `<a>` tags. The URL is cached and can be revoked later.
     *
     * @param {string} pKey - Storage key
     * @param {function} fCallback - Callback with (pError, pObjectURL)
     */
    getBlobURL(pKey: string, fCallback: Function): any;
    /**
     * Delete a blob from the store.
     *
     * Also revokes any cached Object URL for the key.
     *
     * @param {string} pKey - Storage key
     * @param {function} fCallback - Callback with (pError)
     */
    deleteBlob(pKey: string, fCallback: Function): any;
    /**
     * List all blob keys matching a prefix.
     *
     * @param {string} pPrefix - Key prefix to match (e.g., `Artifact:`)
     * @param {function} fCallback - Callback with (pError, pEntries)
     *   where pEntries is an array of { key, metadata } objects
     */
    listBlobs(pPrefix: string, fCallback: Function): any;
    /**
     * Clear all blobs from the store.
     *
     * Also revokes all cached Object URLs.
     *
     * @param {function} fCallback - Callback with (pError)
     */
    clearAll(fCallback: Function): any;
    /**
     * Revoke all cached Object URLs.
     *
     * Should be called when transitioning away from offline mode
     * to free browser memory.
     */
    revokeAllURLs(): void;
}
declare namespace BlobStoreManager {
    export { isFableService, serviceType, BlobMetadata, BlobEntry };
}
import libFableServiceBase = require("fable-serviceproviderbase");
declare var isFableService: boolean;
declare const serviceType: "BlobStoreManager";
type BlobMetadata = {
    /**
     * - MIME type of the blob
     */
    mimeType: string;
    /**
     * - Original file name
     */
    fileName: string;
    /**
     * - Size in bytes
     */
    size: number;
    /**
     * - Entity type (e.g., 'Artifact')
     */
    entityType: string;
    /**
     * - Entity record ID
     */
    entityID: number | string;
    /**
     * - Entity version
     */
    version: number | string;
    /**
     * - ISO 8601 timestamp
     */
    createdAt: string;
};
type BlobEntry = {
    /**
     * - The binary data
     */
    blob: Blob;
    /**
     * - Associated metadata
     */
    metadata: BlobMetadata;
};
//# sourceMappingURL=Blob-Store-Manager.d.ts.map