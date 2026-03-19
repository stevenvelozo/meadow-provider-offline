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
 * @typedef {object} BlobStorageDelegate
 * @property {(pKey: string, pBlobData: Blob|File|ArrayBuffer, pMetadata: BlobMetadata, fCallback: (pError?: Error) => void) => void} storeBlob
 * @property {(pKey: string, fCallback: (pError?: Error, pBlobEntry?: BlobEntry) => void) => void} getBlob
 * @property {(pKey: string, fCallback: (pError?: Error) => void) => void} deleteBlob
 * @property {(pPrefix: string, fCallback: (pError?: Error, pEntries?: Array<{key: string, metadata: BlobMetadata}>) => void) => void} listBlobs
 * @property {(fCallback: (pError?: Error) => void) => void} clearAll
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
     * Optional external storage delegate. When set, all storage
     * operations route through this delegate instead of IndexedDB.
     * @type {BlobStorageDelegate|null}
     * @private
     */
    private _storageDelegate;
    /**
     * Whether the BlobStore is running in degraded (no-op) mode.
     *
     * When neither IndexedDB nor a storage delegate is available
     * (e.g., Node.js test environment), the BlobStore initializes
     * successfully but all storage operations return empty/null
     * results instead of errors.
     *
     * @type {boolean}
     */
    get degraded(): boolean;
    /**
     * Set an external storage delegate for blob operations.
     *
     * When a delegate is provided, all storage operations (store, get,
     * delete, list, clear) route through the delegate instead of
     * IndexedDB. This enables native bridging in environments like
     * iOS WKWebView where IndexedDB is unreliable.
     *
     * Call this before `initializeAsync()` to skip IndexedDB setup
     * entirely, or after initialization to switch storage backends.
     *
     * The delegate must implement:
     * - `storeBlob(pKey, pBlobData, pMetadata, fCallback)`
     * - `getBlob(pKey, fCallback)` → callback(pError, { blob, metadata })
     * - `deleteBlob(pKey, fCallback)`
     * - `listBlobs(pPrefix, fCallback)` → callback(pError, [{ key, metadata }])
     * - `clearAll(fCallback)`
     *
     * @param {BlobStorageDelegate} pDelegate - The storage delegate
     */
    setStorageDelegate(pDelegate: BlobStorageDelegate): void;
    /**
     * Initialize the blob storage backend.
     *
     * If a storage delegate has been set via `setStorageDelegate()`,
     * IndexedDB initialization is skipped entirely. Otherwise, opens
     * (or creates) the `meadow-offline-blobs` IndexedDB database.
     *
     * In environments where neither a delegate nor IndexedDB is
     * available, initializes in degraded (no-op) mode.
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
    export { isFableService, serviceType, BlobMetadata, BlobEntry, BlobStorageDelegate };
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
type BlobStorageDelegate = {
    storeBlob: (pKey: string, pBlobData: Blob | File | ArrayBuffer, pMetadata: BlobMetadata, fCallback: (pError?: Error) => void) => void;
    getBlob: (pKey: string, fCallback: (pError?: Error, pBlobEntry?: BlobEntry) => void) => void;
    deleteBlob: (pKey: string, fCallback: (pError?: Error) => void) => void;
    listBlobs: (pPrefix: string, fCallback: (pError?: Error, pEntries?: Array<{
        key: string;
        metadata: BlobMetadata;
    }>) => void) => void;
    clearAll: (fCallback: (pError?: Error) => void) => void;
};
//# sourceMappingURL=Blob-Store-Manager.d.ts.map