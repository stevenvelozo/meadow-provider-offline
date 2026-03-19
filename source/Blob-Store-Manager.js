/**
 * Blob-Store-Manager - Binary storage for offline media.
 *
 * Stores binary data (images, videos, files) for offline observation
 * support. Each blob is stored with metadata (MIME type, file name,
 * size, etc.) and can be retrieved as a Blob or Object URL.
 *
 * Storage backends:
 * - **IndexedDB** (default): Used in standard browser environments.
 * - **Custom delegate**: Set via `setStorageDelegate()` for environments
 *   where IndexedDB is unavailable or undesirable (e.g., iOS WKWebView
 *   bridging to native file storage). When a delegate is set, all
 *   storage operations route through it instead of IndexedDB.
 *
 * Key format: `{entityType}:{localID}:v{version}` (e.g., `Artifact:3:v1`)
 *
 * @license MIT
 */
const libFableServiceBase = require('fable-serviceproviderbase');

const DATABASE_NAME = 'meadow-offline-blobs';
const DATABASE_VERSION = 1;
const STORE_NAME = 'blobs';

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
class BlobStoreManager extends libFableServiceBase
{
	/**
	 * @param {object} pFable - The Fable instance
	 * @param {object} pOptions - Service options
	 * @param {string} pServiceHash - Service hash
	 */
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'BlobStoreManager';

		/**
		 * The IndexedDB database handle.
		 * @type {IDBDatabase|null}
		 * @private
		 */
		this._db = null;

		/**
		 * Whether the BlobStore is initialized.
		 * @type {boolean}
		 */
		this.initialized = false;

		/**
		 * Map of active Object URLs for revocation.
		 * @type {Map<string, string>}
		 * @private
		 */
		this._objectURLs = new Map();

		/**
		 * Optional external storage delegate. When set, all storage
		 * operations route through this delegate instead of IndexedDB.
		 * @type {BlobStorageDelegate|null}
		 * @private
		 */
		this._storageDelegate = null;
	}

	// ========================================================================
	// Initialization
	// ========================================================================

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
	get degraded()
	{
		return this.initialized && !this._db && !this._storageDelegate;
	}

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
	setStorageDelegate(pDelegate)
	{
		if (!pDelegate)
		{
			this.log.warn('BlobStoreManager: setStorageDelegate called with falsy value — ignored.');
			return;
		}

		let tmpRequiredMethods = ['storeBlob', 'getBlob', 'deleteBlob', 'listBlobs', 'clearAll'];
		for (let i = 0; i < tmpRequiredMethods.length; i++)
		{
			if (typeof pDelegate[tmpRequiredMethods[i]] !== 'function')
			{
				this.log.error(`BlobStoreManager: Storage delegate missing required method "${tmpRequiredMethods[i]}" — delegate not set.`);
				return;
			}
		}

		this._storageDelegate = pDelegate;
		this.log.info('BlobStoreManager: Storage delegate set — operations will route through delegate.');
	}

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
	initializeAsync(fCallback)
	{
		if (this.initialized)
		{
			this.log.warn('BlobStoreManager: Already initialized — skipping.');
			return fCallback();
		}

		// If a storage delegate is set, skip IndexedDB entirely.
		if (this._storageDelegate)
		{
			this.initialized = true;
			this.log.info('BlobStoreManager: Storage delegate active — skipping IndexedDB initialization.');
			return fCallback();
		}

		if (typeof indexedDB === 'undefined')
		{
			this.initialized = true;
			this.log.warn('BlobStoreManager: IndexedDB is not available — running in degraded (no-op) mode.');
			return fCallback();
		}

		let tmpSelf = this;

		try
		{
			let tmpRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

			tmpRequest.onerror = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBOpenDBRequest} */ (pEvent.target);
				let tmpError = new Error(`BlobStoreManager: Failed to open IndexedDB — ${tmpTarget.error}`);
				tmpSelf.log.error(tmpError.message);
				return fCallback(tmpError);
			};

			tmpRequest.onupgradeneeded = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBOpenDBRequest} */ (pEvent.target);
				let tmpDB = tmpTarget.result;

				if (!tmpDB.objectStoreNames.contains(STORE_NAME))
				{
					tmpDB.createObjectStore(STORE_NAME, { keyPath: 'key' });
					tmpSelf.log.info('BlobStoreManager: Created object store.');
				}
			};

			tmpRequest.onsuccess = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBOpenDBRequest} */ (pEvent.target);
				tmpSelf._db = tmpTarget.result;
				tmpSelf.initialized = true;
				tmpSelf.log.info('BlobStoreManager: Initialized successfully.');
				return fCallback();
			};
		}
		catch (pError)
		{
			this.log.error('BlobStoreManager: Exception during initialization', { Error: pError.message });
			return fCallback(pError);
		}
	}

	// ========================================================================
	// Store / Retrieve / Delete
	// ========================================================================

	/**
	 * Store a blob with metadata.
	 *
	 * @param {string} pKey - Storage key (e.g., `Artifact:3:v1`)
	 * @param {Blob|File|ArrayBuffer} pBlobData - The binary data
	 * @param {BlobMetadata} pMetadata - Metadata about the blob
	 * @param {(pError?: Error) => void} fCallback - Callback with (pError)
	 */
	storeBlob(pKey, pBlobData, pMetadata, fCallback)
	{
		if (this._storageDelegate)
		{
			return this._storageDelegate.storeBlob(pKey, pBlobData, pMetadata, fCallback);
		}

		if (!this._db)
		{
			if (this.degraded)
			{
				this.log.warn(`BlobStoreManager: Degraded mode — skipping store for [${pKey}]`);
				return fCallback(null);
			}
			return fCallback(new Error('BlobStoreManager: Not initialized.'));
		}

		if (!pKey || !pBlobData)
		{
			return fCallback(new Error('BlobStoreManager: Key and blob data are required.'));
		}

		try
		{
			// Ensure we have a proper Blob
			let tmpBlob = pBlobData;
			if (pBlobData instanceof ArrayBuffer)
			{
				tmpBlob = new Blob([pBlobData], { type: (pMetadata && pMetadata.mimeType) || 'application/octet-stream' });
			}

			let tmpEntry = {
				key: pKey,
				blob: tmpBlob,
				metadata: pMetadata || {}
			};

			let tmpTransaction = this._db.transaction([STORE_NAME], 'readwrite');
			let tmpStore = tmpTransaction.objectStore(STORE_NAME);
			let tmpRequest = tmpStore.put(tmpEntry);

			tmpRequest.onerror = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBRequest} */ (pEvent.target);
				let tmpError = new Error(`BlobStoreManager: Failed to store blob [${pKey}] — ${tmpTarget.error}`);
				this.log.error(tmpError.message);
				return fCallback(tmpError);
			};

			tmpRequest.onsuccess = () =>
			{
				let tmpSize = (tmpBlob instanceof Blob) ? tmpBlob.size : (/** @type {ArrayBuffer} */ (tmpBlob)).byteLength;
				this.log.info(`BlobStoreManager: Stored blob [${pKey}] (${tmpSize} bytes)`);
				return fCallback(null);
			};
		}
		catch (pError)
		{
			this.log.error(`BlobStoreManager: Exception storing blob [${pKey}]`, { Error: pError.message });
			return fCallback(pError);
		}
	}

	/**
	 * Retrieve a blob and its metadata.
	 *
	 * @param {string} pKey - Storage key
	 * @param {(pError?: Error, pBlobEntry?: { blob: Blob, metadata: BlobMetadata }) => void} fCallback - Callback with (pError, pBlobEntry)
	 */
	getBlob(pKey, fCallback)
	{
		if (this._storageDelegate)
		{
			return this._storageDelegate.getBlob(pKey, fCallback);
		}

		if (!this._db)
		{
			if (this.degraded)
			{
				return fCallback(null, null);
			}
			return fCallback(new Error('BlobStoreManager: Not initialized.'));
		}

		try
		{
			let tmpTransaction = this._db.transaction([STORE_NAME], 'readonly');
			let tmpStore = tmpTransaction.objectStore(STORE_NAME);
			let tmpRequest = tmpStore.get(pKey);

			tmpRequest.onerror = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBRequest} */ (pEvent.target);
				let tmpError = new Error(`BlobStoreManager: Failed to retrieve blob [${pKey}] — ${tmpTarget.error}`);
				this.log.error(tmpError.message);
				return fCallback(tmpError);
			};

			tmpRequest.onsuccess = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBRequest} */ (pEvent.target);
				let tmpResult = tmpTarget.result;
				if (!tmpResult)
				{
					return fCallback(null, null);
				}
				return fCallback(null, { blob: tmpResult.blob, metadata: tmpResult.metadata });
			};
		}
		catch (pError)
		{
			this.log.error(`BlobStoreManager: Exception retrieving blob [${pKey}]`, { Error: pError.message });
			return fCallback(pError);
		}
	}

	/**
	 * Get an Object URL for a stored blob.
	 *
	 * Creates a `blob:` URL that can be used in `<img>`, `<video>`, or
	 * `<a>` tags. The URL is cached and can be revoked later.
	 *
	 * @param {string} pKey - Storage key
	 * @param {function} fCallback - Callback with (pError, pObjectURL)
	 */
	getBlobURL(pKey, fCallback)
	{
		// Check for a cached Object URL first
		if (this._objectURLs.has(pKey))
		{
			return fCallback(null, this._objectURLs.get(pKey));
		}

		this.getBlob(pKey,
			(pError, pResult) =>
			{
				if (pError)
				{
					return fCallback(pError);
				}
				if (!pResult || !pResult.blob)
				{
					return fCallback(null, null);
				}

				try
				{
					let tmpURL = URL.createObjectURL(pResult.blob);
					this._objectURLs.set(pKey, tmpURL);
					return fCallback(null, tmpURL);
				}
				catch (pURLError)
				{
					this.log.error(`BlobStoreManager: Failed to create Object URL for [${pKey}]`, { Error: pURLError.message });
					return fCallback(pURLError);
				}
			});
	}

	/**
	 * Delete a blob from the store.
	 *
	 * Also revokes any cached Object URL for the key.
	 *
	 * @param {string} pKey - Storage key
	 * @param {function} fCallback - Callback with (pError)
	 */
	deleteBlob(pKey, fCallback)
	{
		// Revoke any cached Object URL regardless of backend
		if (this._objectURLs.has(pKey))
		{
			URL.revokeObjectURL(this._objectURLs.get(pKey));
			this._objectURLs.delete(pKey);
		}

		if (this._storageDelegate)
		{
			return this._storageDelegate.deleteBlob(pKey, fCallback);
		}

		if (!this._db)
		{
			if (this.degraded)
			{
				return fCallback(null);
			}
			return fCallback(new Error('BlobStoreManager: Not initialized.'));
		}

		try
		{
			let tmpTransaction = this._db.transaction([STORE_NAME], 'readwrite');
			let tmpStore = tmpTransaction.objectStore(STORE_NAME);
			let tmpRequest = tmpStore.delete(pKey);

			tmpRequest.onerror = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBRequest} */ (pEvent.target);
				let tmpError = new Error(`BlobStoreManager: Failed to delete blob [${pKey}] — ${tmpTarget.error}`);
				this.log.error(tmpError.message);
				return fCallback(tmpError);
			};

			tmpRequest.onsuccess = () =>
			{
				this.log.info(`BlobStoreManager: Deleted blob [${pKey}]`);
				return fCallback(null);
			};
		}
		catch (pError)
		{
			this.log.error(`BlobStoreManager: Exception deleting blob [${pKey}]`, { Error: pError.message });
			return fCallback(pError);
		}
	}

	// ========================================================================
	// Enumeration
	// ========================================================================

	/**
	 * List all blob keys matching a prefix.
	 *
	 * @param {string} pPrefix - Key prefix to match (e.g., `Artifact:`)
	 * @param {function} fCallback - Callback with (pError, pEntries)
	 *   where pEntries is an array of { key, metadata } objects
	 */
	listBlobs(pPrefix, fCallback)
	{
		if (this._storageDelegate)
		{
			return this._storageDelegate.listBlobs(pPrefix, fCallback);
		}

		if (!this._db)
		{
			if (this.degraded)
			{
				return fCallback(null, []);
			}
			return fCallback(new Error('BlobStoreManager: Not initialized.'));
		}

		try
		{
			let tmpTransaction = this._db.transaction([STORE_NAME], 'readonly');
			let tmpStore = tmpTransaction.objectStore(STORE_NAME);
			let tmpRequest = tmpStore.openCursor();
			let tmpResults = [];

			tmpRequest.onerror = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBRequest} */ (pEvent.target);
				let tmpError = new Error(`BlobStoreManager: Failed to list blobs — ${tmpTarget.error}`);
				this.log.error(tmpError.message);
				return fCallback(tmpError);
			};

			tmpRequest.onsuccess = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBRequest} */ (pEvent.target);
				let tmpCursor = tmpTarget.result;
				if (tmpCursor)
				{
					if (!pPrefix || tmpCursor.value.key.startsWith(pPrefix))
					{
						tmpResults.push({
							key: tmpCursor.value.key,
							metadata: tmpCursor.value.metadata
						});
					}
					tmpCursor.continue();
				}
				else
				{
					// Done iterating
					return fCallback(null, tmpResults);
				}
			};
		}
		catch (pError)
		{
			this.log.error('BlobStoreManager: Exception listing blobs', { Error: pError.message });
			return fCallback(pError);
		}
	}

	// ========================================================================
	// Cleanup
	// ========================================================================

	/**
	 * Clear all blobs from the store.
	 *
	 * Also revokes all cached Object URLs.
	 *
	 * @param {function} fCallback - Callback with (pError)
	 */
	clearAll(fCallback)
	{
		this.revokeAllURLs();

		if (this._storageDelegate)
		{
			return this._storageDelegate.clearAll(fCallback);
		}

		if (!this._db)
		{
			if (this.degraded)
			{
				return fCallback(null);
			}
			return fCallback(new Error('BlobStoreManager: Not initialized.'));
		}

		try
		{
			let tmpTransaction = this._db.transaction([STORE_NAME], 'readwrite');
			let tmpStore = tmpTransaction.objectStore(STORE_NAME);
			let tmpRequest = tmpStore.clear();

			tmpRequest.onerror = (pEvent) =>
			{
				let tmpTarget = /** @type {IDBRequest} */ (pEvent.target);
				let tmpError = new Error(`BlobStoreManager: Failed to clear store — ${tmpTarget.error}`);
				this.log.error(tmpError.message);
				return fCallback(tmpError);
			};

			tmpRequest.onsuccess = () =>
			{
				this.log.info('BlobStoreManager: Cleared all blobs.');
				return fCallback(null);
			};
		}
		catch (pError)
		{
			this.log.error('BlobStoreManager: Exception clearing store', { Error: pError.message });
			return fCallback(pError);
		}
	}

	/**
	 * Revoke all cached Object URLs.
	 *
	 * Should be called when transitioning away from offline mode
	 * to free browser memory.
	 */
	revokeAllURLs()
	{
		for (let [tmpKey, tmpURL] of this._objectURLs)
		{
			try
			{
				URL.revokeObjectURL(tmpURL);
			}
			catch (pError)
			{
				this.log.warn(`BlobStoreManager: Failed to revoke Object URL for [${tmpKey}]`);
			}
		}
		this._objectURLs.clear();
		this.log.info(`BlobStoreManager: Revoked all Object URLs.`);
	}
}

// Explicitly set isFableService — class field inheritance can break in
// some browserify bundles when the parent module is a different copy.
BlobStoreManager.isFableService = true;

module.exports = BlobStoreManager;
module.exports.serviceType = 'BlobStoreManager';
