/**
 * Meadow-Provider-Offline - Offline-capable Meadow provider for the browser.
 *
 * Provides a complete offline data layer by:
 *   1. Intercepting REST requests that match registered Meadow entity patterns
 *   2. Routing them through an in-process Orator IPC to meadow-endpoints
 *   3. Backed by an in-memory SQLite database (via sql.js WASM)
 *   4. Tracking dirty mutations for eventual sync back to the server
 *
 * Non-matching REST requests pass through to the real HTTP RestClient,
 * preserving auth, external API calls, and other non-meadow traffic.
 *
 * Usage:
 *   const libMeadowProviderOffline = require('meadow-provider-offline');
 *
 *   // Register and instantiate
 *   fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
 *   let offlineProvider = fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
 *       SessionDataSource: 'None',
 *       DefaultSessionObject: { UserID: 1, UserRole: 'User', ... }
 *   });
 *
 *   // Initialize (async — sets up SQLite + Orator IPC)
 *   offlineProvider.initializeAsync((pError) => {
 *       // Add entities from meadow schema package objects
 *       offlineProvider.addEntity(bookSchema);
 *       offlineProvider.addEntity(authorSchema);
 *
 *       // Start intercepting RestClient requests
 *       offlineProvider.connect(fable.RestClient);
 *
 *       // Seed data from server
 *       offlineProvider.seedEntity('Book', bookRecords);
 *   });
 *
 * @license MIT
 * @author Steven Velozo <steven@velozo.com>
 */
const libFableServiceBase = require('fable-serviceproviderbase');
const libMeadow = require('meadow');
const libMeadowEndpoints = require('meadow-endpoints');

const libDataCacheManager = require('./Data-Cache-Manager.js');
const libIPCOratorManager = require('./IPC-Orator-Manager.js');
const libRestClientInterceptor = require('./RestClient-Interceptor.js');
const libDirtyRecordTracker = require('./Dirty-Record-Tracker.js');
const libBlobStoreManager = require('./Blob-Store-Manager.js');

/**
 * @class MeadowProviderOffline
 * @extends libFableServiceBase
 */
class MeadowProviderOffline extends libFableServiceBase
{
	/**
	 * @param {object} pFable - The Fable instance
	 * @param {object} pOptions - Service options
	 * @param {string} pServiceHash - Service hash
	 */
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'MeadowProviderOffline';

		/**
		 * The Data Cache Manager (SQLite management).
		 * @type {import('./Data-Cache-Manager.js')|null}
		 */
		this._DataCacheManager = null;

		/**
		 * The IPC Orator Manager.
		 * @type {import('./IPC-Orator-Manager.js')|null}
		 */
		this._IPCOratorManager = null;

		/**
		 * The RestClient Interceptor.
		 * @type {import('./RestClient-Interceptor.js')|null}
		 */
		this._RestClientInterceptor = null;

		/**
		 * The Dirty Record Tracker.
		 * @type {import('./Dirty-Record-Tracker.js')|null}
		 */
		this._DirtyRecordTracker = null;

		/**
		 * The Blob Store Manager (IndexedDB binary storage).
		 * @type {import('./Blob-Store-Manager.js')|null}
		 */
		this._BlobStoreManager = null;

		/**
		 * Registered entities.
		 * @type {Record<string, { dal: object, endpoints: object, schema: object }>}
		 */
		this._Entities = {};

		/**
		 * Ordered list of entity names.
		 * @type {string[]}
		 */
		this._EntityNames = [];

		/**
		 * Whether the provider is initialized.
		 * @type {boolean}
		 */
		this.initialized = false;

		/**
		 * Whether negative ID assignment is enabled for offline creates.
		 * When true, Create-PreOperation behaviors query MIN(ID) from the
		 * entity's SQLite table and assign the next ID below that (or -1
		 * if the table has no negative IDs yet).
		 * @type {boolean}
		 */
		this._negativeIDsEnabled = false;
	}

	// ========================================================================
	// Sub-service accessors
	// ========================================================================

	/**
	 * Get the Dirty Record Tracker.
	 *
	 * @returns {import('./Dirty-Record-Tracker.js')|null}
	 */
	get dirtyTracker()
	{
		return this._DirtyRecordTracker;
	}

	/**
	 * Get the Data Cache Manager.
	 *
	 * @returns {import('./Data-Cache-Manager.js')|null}
	 */
	get dataCacheManager()
	{
		return this._DataCacheManager;
	}

	/**
	 * Get the IPC Orator Manager.
	 *
	 * @returns {import('./IPC-Orator-Manager.js')|null}
	 */
	get ipcOratorManager()
	{
		return this._IPCOratorManager;
	}

	/**
	 * Get the RestClient Interceptor.
	 *
	 * @returns {import('./RestClient-Interceptor.js')|null}
	 */
	get restClientInterceptor()
	{
		return this._RestClientInterceptor;
	}

	/**
	 * Get the Blob Store Manager.
	 *
	 * @returns {import('./Blob-Store-Manager.js')|null}
	 */
	get blobStore()
	{
		return this._BlobStoreManager;
	}

	/**
	 * Get the registered entity names.
	 *
	 * @returns {string[]}
	 */
	get entityNames()
	{
		return this._EntityNames.slice();
	}

	/**
	 * Get a registered entity by name.
	 *
	 * @param {string} pEntityName - Entity name
	 * @returns {{ dal: object, endpoints: object, schema: object }|undefined}
	 */
	getEntity(pEntityName)
	{
		return this._Entities[pEntityName];
	}

	// ========================================================================
	// Initialization
	// ========================================================================

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
	initializeAsync(fCallback)
	{
		let tmpSelf = this;

		if (this.initialized)
		{
			this.log.warn('MeadowProviderOffline: Already initialized — skipping.');
			return fCallback();
		}

		// Create sub-services
		this.fable.serviceManager.addServiceType('DataCacheManager', libDataCacheManager);
		this._DataCacheManager = this.fable.serviceManager.instantiateServiceProvider('DataCacheManager', {}, `${this.Hash}-DataCache`);

		this.fable.serviceManager.addServiceType('IPCOratorManager', libIPCOratorManager);
		this._IPCOratorManager = this.fable.serviceManager.instantiateServiceProvider('IPCOratorManager', {}, `${this.Hash}-IPCOrator`);

		this.fable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
		this._RestClientInterceptor = this.fable.serviceManager.instantiateServiceProvider('RestClientInterceptor', {}, `${this.Hash}-Interceptor`);

		this.fable.serviceManager.addServiceType('DirtyRecordTracker', libDirtyRecordTracker);
		this._DirtyRecordTracker = this.fable.serviceManager.instantiateServiceProvider('DirtyRecordTracker', {}, `${this.Hash}-DirtyTracker`);

		this.fable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
		this._BlobStoreManager = this.fable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, `${this.Hash}-BlobStore`);

		// Apply session configuration for browser-side meadow-endpoints
		this._applySessionConfig();

		// Initialize Data Cache Manager (SQLite)
		this._DataCacheManager.initializeAsync(
			(pError) =>
			{
				if (pError)
				{
					tmpSelf.log.error('MeadowProviderOffline: Failed to initialize DataCacheManager', { Error: pError });
					return fCallback(pError);
				}

				// Initialize IPC Orator Manager
				tmpSelf._IPCOratorManager.initializeAsync(
					(pOratorError) =>
					{
						if (pOratorError)
						{
							tmpSelf.log.error('MeadowProviderOffline: Failed to initialize IPCOratorManager', { Error: pOratorError });
							return fCallback(pOratorError);
						}

						// Initialize BlobStore Manager (IndexedDB)
						tmpSelf._BlobStoreManager.initializeAsync(
							(pBlobStoreError) =>
							{
								if (pBlobStoreError)
								{
									tmpSelf.log.error('MeadowProviderOffline: Failed to initialize BlobStoreManager', { Error: pBlobStoreError });
									return fCallback(pBlobStoreError);
								}

								tmpSelf.initialized = true;
								tmpSelf.log.info('MeadowProviderOffline: Initialized successfully.');
								return fCallback();
							});
					});
			});
	}

	/**
	 * Apply session configuration to fable settings.
	 *
	 * Configures meadow-endpoints to bypass session authentication
	 * for browser-side IPC operations.
	 *
	 * @private
	 */
	_applySessionConfig()
	{
		// Session bypass for browser-side meadow-endpoints
		if (this.options.SessionDataSource)
		{
			this.fable.settings.MeadowEndpointsSessionDataSource = this.options.SessionDataSource;
		}
		else
		{
			this.fable.settings.MeadowEndpointsSessionDataSource = 'None';
		}

		if (this.options.DefaultSessionObject)
		{
			this.fable.settings.MeadowEndpointsDefaultSessionObject = this.options.DefaultSessionObject;
		}
		else
		{
			this.fable.settings.MeadowEndpointsDefaultSessionObject = {
				CustomerID: 1,
				SessionID: 'browser-offline',
				DeviceID: 'Browser',
				UserID: 1,
				UserRole: 'User',
				UserRoleIndex: 1,
				LoggedIn: true
			};
		}

		// MeadowEndpoints provider URL config
		if (this.options.MeadowEndpoints)
		{
			this.fable.settings.MeadowEndpoints = this.options.MeadowEndpoints;
		}
	}

	// ========================================================================
	// Entity Management
	// ========================================================================

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
	addEntity(pSchema, fCallback)
	{
		let tmpCallback = (typeof fCallback === 'function') ? fCallback : () => {};

		if (!this.initialized)
		{
			let tmpError = new Error('MeadowProviderOffline: Not initialized. Call initializeAsync() first.');
			this.log.error(tmpError.message);
			return tmpCallback(tmpError);
		}

		if (!pSchema || !pSchema.Scope)
		{
			let tmpError = new Error('MeadowProviderOffline: Invalid schema — must have a Scope property.');
			this.log.error(tmpError.message);
			return tmpCallback(tmpError);
		}

		let tmpEntityName = pSchema.Scope;

		if (this._Entities[tmpEntityName])
		{
			this.log.warn(`MeadowProviderOffline: Entity ${tmpEntityName} already registered — skipping.`);
			return tmpCallback();
		}

		let tmpSelf = this;

		// Create the Meadow DAL
		let tmpMeadow = libMeadow.new(this.fable);
		let tmpDAL = tmpMeadow.loadFromPackageObject(pSchema);
		tmpDAL.setProvider('SQLite');
		tmpDAL.setIDUser(1);

		// Create MeadowEndpoints for this entity
		let tmpEndpoints = libMeadowEndpoints.new(tmpDAL);

		// Add dirty tracking behaviors
		this._addDirtyTrackingBehaviors(tmpEntityName, tmpEndpoints);

		// Create the SQLite table
		this._DataCacheManager.createTable(pSchema,
			(pTableError) =>
			{
				if (pTableError)
				{
					tmpSelf.log.error(`MeadowProviderOffline: Error creating table for ${tmpEntityName}`, { Error: pTableError });
					return tmpCallback(pTableError);
				}

				// Connect routes to IPC Orator
				tmpSelf._IPCOratorManager.connectEntityRoutes(tmpEndpoints);

				// Register URL prefixes for interception
				// meadow-endpoints uses the scope for singular routes and scope + 's' for plural
				let tmpEndpointPrefix = `/${tmpEndpoints.EndpointVersion}/${tmpEndpoints.EndpointName}`;
				tmpSelf._RestClientInterceptor.registerPrefix(tmpEndpointPrefix, tmpEntityName);

				// Store the entity
				tmpSelf._Entities[tmpEntityName] = {
					dal: tmpDAL,
					endpoints: tmpEndpoints,
					schema: pSchema
				};
				tmpSelf._EntityNames.push(tmpEntityName);

				tmpSelf.log.info(`MeadowProviderOffline: Entity ${tmpEntityName} registered (prefix: ${tmpEndpointPrefix})`);
				return tmpCallback();
			});
	}

	/**
	 * Remove a registered entity.
	 *
	 * Unregisters URL prefixes and removes from the entity registry.
	 * Does NOT drop the SQLite table (use dataCacheManager.dropTable for that).
	 *
	 * @param {string} pEntityName - The entity name to remove
	 */
	removeEntity(pEntityName)
	{
		let tmpEntity = this._Entities[pEntityName];
		if (!tmpEntity)
		{
			this.log.warn(`MeadowProviderOffline: Entity ${pEntityName} not registered — nothing to remove.`);
			return;
		}

		// Unregister URL prefix
		let tmpEndpointPrefix = `/${tmpEntity.endpoints.EndpointVersion}/${tmpEntity.endpoints.EndpointName}`;
		this._RestClientInterceptor.unregisterPrefix(tmpEndpointPrefix);

		// Remove from registry
		delete this._Entities[pEntityName];
		this._EntityNames = this._EntityNames.filter((pName) => pName !== pEntityName);

		this.log.info(`MeadowProviderOffline: Entity ${pEntityName} removed.`);
	}

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
	addEntities(pSchemas, fCallback)
	{
		let tmpCallback = (typeof fCallback === 'function') ? fCallback : () => {};

		if (!this.initialized)
		{
			let tmpError = new Error('MeadowProviderOffline: Not initialized. Call initializeAsync() first.');
			this.log.error(tmpError.message);
			return tmpCallback(tmpError);
		}

		if (!Array.isArray(pSchemas) || pSchemas.length === 0)
		{
			return tmpCallback();
		}

		let tmpIndex = 0;
		let tmpSelf = this;
		let tmpFirstError = null;

		let tmpNext = () =>
		{
			if (tmpIndex >= pSchemas.length)
			{
				tmpSelf.log.info(`MeadowProviderOffline: Batch registered ${pSchemas.length} entities.`);
				return tmpCallback(tmpFirstError);
			}

			let tmpSchema = pSchemas[tmpIndex];
			tmpIndex++;

			tmpSelf.addEntity(tmpSchema,
				(pError) =>
				{
					if (pError && !tmpFirstError)
					{
						tmpFirstError = pError;
					}
					tmpNext();
				});
		};

		tmpNext();
	}

	// ========================================================================
	// Data Population
	// ========================================================================

	/**
	 * Seed an entity's SQLite table with records.
	 *
	 * Clears existing data and inserts the provided records.
	 *
	 * @param {string} pEntityName - The entity name
	 * @param {Array<object>} pRecords - Array of record objects
	 * @param {function} [fCallback] - Optional callback
	 */
	seedEntity(pEntityName, pRecords, fCallback)
	{
		let tmpCallback = (typeof fCallback === 'function') ? fCallback : () => {};

		if (!this._Entities[pEntityName])
		{
			let tmpError = new Error(`MeadowProviderOffline: Entity ${pEntityName} not registered. Call addEntity() first.`);
			this.log.error(tmpError.message);
			return tmpCallback(tmpError);
		}

		this._DataCacheManager.seedTable(pEntityName, pRecords);
		return tmpCallback();
	}

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
	injectRecords(pEntityName, pRecords, fCallback)
	{
		return this.seedEntity(pEntityName, pRecords, fCallback);
	}

	// ========================================================================
	// RestClient Interception
	// ========================================================================

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
	connect(pRestClient, pHeadlightRestClient)
	{
		if (!this.initialized)
		{
			this.log.error('MeadowProviderOffline: Not initialized. Call initializeAsync() first.');
			return;
		}

		let tmpRestClient = pRestClient;
		if (!tmpRestClient)
		{
			if (this.fable.RestClient)
			{
				tmpRestClient = this.fable.RestClient;
			}
			else
			{
				this.log.error('MeadowProviderOffline.connect: No RestClient provided or available on fable.');
				return;
			}
		}

		this._RestClientInterceptor.connect(tmpRestClient, this._IPCOratorManager);

		// Also intercept the HeadlightRestClient's internal RestClient if it's
		// a different instance. HeadlightRestClient maintains its own RestClient
		// that all provider JSON methods (getJSON, putJSON, postJSON) route through.
		// Without this, those calls bypass the IPC interception entirely.
		if (pHeadlightRestClient && pHeadlightRestClient.restClient
			&& pHeadlightRestClient.restClient !== tmpRestClient)
		{
			this._RestClientInterceptor.connectAdditionalRestClient(pHeadlightRestClient.restClient);
		}

		// Enable binary interception (BlobStore routing) if BlobStoreManager is available.
		// Binary upload/download interception happens at the RestClient level via the
		// executeBinaryUpload and executeChunkedRequest wrappers set up by connect().
		if (this._BlobStoreManager)
		{
			this._RestClientInterceptor.connectBinary(
				this._BlobStoreManager,
				this._DirtyRecordTracker
			);
		}
	}

	/**
	 * Disconnect the interceptor from the RestClient.
	 *
	 * Restores the original RestClient behavior.
	 *
	 * @param {object} [pRestClient] - Optional; if not provided, disconnects the previously connected RestClient
	 * @returns {boolean} True if successfully disconnected
	 */
	disconnect(pRestClient)
	{
		return this._RestClientInterceptor.disconnect(pRestClient);
	}

	// ========================================================================
	// Cache-Through
	// ========================================================================

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
	enableCacheThrough()
	{
		let tmpSelf = this;

		this._RestClientInterceptor.setCacheIngestCallback(
			(pEntityName, pData) =>
			{
				if (!tmpSelf._Entities[pEntityName])
				{
					return;
				}

				let tmpRecords = Array.isArray(pData) ? pData : [pData];

				// Filter out records that have pending dirty mutations —
				// the local version is authoritative until synced.
				let tmpIDField = tmpSelf._Entities[pEntityName].schema.DefaultIdentifier;
				let tmpCleanRecords = tmpRecords.filter(
					(pRecord) =>
					{
						let tmpID = pRecord[tmpIDField];
						let tmpKey = `${pEntityName}:${tmpID}`;
						return !tmpSelf._DirtyRecordTracker._dirtyMap.hasOwnProperty(tmpKey);
					});

				if (tmpCleanRecords.length > 0)
				{
					tmpSelf._DataCacheManager.ingestRecords(pEntityName, tmpCleanRecords);
				}
			});

		this.log.info('MeadowProviderOffline: Cache-through enabled.');
	}

	/**
	 * Disable cache-through mode.
	 */
	disableCacheThrough()
	{
		this._RestClientInterceptor.setCacheIngestCallback(null);
		this.log.info('MeadowProviderOffline: Cache-through disabled.');
	}

	// ========================================================================
	// Negative ID Management
	// ========================================================================

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
	enableNegativeIDs()
	{
		this._negativeIDsEnabled = true;
		this.log.info('MeadowProviderOffline: Negative ID assignment enabled.');
	}

	/**
	 * Disable negative ID assignment for offline creates.
	 *
	 * New records will use SQLite AUTOINCREMENT (positive IDs).
	 */
	disableNegativeIDs()
	{
		this._negativeIDsEnabled = false;
		this.log.info('MeadowProviderOffline: Negative ID assignment disabled.');
	}

	/**
	 * Get the next negative ID for an entity by querying MIN(ID) from
	 * its SQLite table.
	 *
	 * Returns min(currentMin, 0) - 1, so:
	 *   - Empty table or all-positive IDs → -1
	 *   - Table has ID -3 as minimum → -4
	 *
	 * @param {string} pEntityName - The entity name
	 * @returns {number} The next negative ID to assign
	 */
	getNextNegativeID(pEntityName)
	{
		let tmpEntity = this._Entities[pEntityName];
		if (!tmpEntity)
		{
			return -1;
		}

		let tmpIDField = tmpEntity.schema.DefaultIdentifier;

		try
		{
			let tmpRow = this._DataCacheManager.db
				.prepare(`SELECT MIN(\`${tmpIDField}\`) AS minID FROM \`${pEntityName}\``)
				.get();
			let tmpMinID = (tmpRow && tmpRow.minID !== null) ? tmpRow.minID : 0;
			return Math.min(tmpMinID, 0) - 1;
		}
		catch (pError)
		{
			this.log.warn(`MeadowProviderOffline: Error querying MIN(ID) for ${pEntityName}: ${pError.message}`);
			return -1;
		}
	}

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
	remapID(pEntityName, pOldID, pNewID)
	{
		let tmpEntity = this._Entities[pEntityName];
		if (!tmpEntity)
		{
			this.log.warn(`MeadowProviderOffline.remapID: Entity ${pEntityName} not registered.`);
			return 0;
		}

		let tmpIDField = tmpEntity.schema.DefaultIdentifier;
		let tmpDb = this._DataCacheManager.db;
		let tmpTotalUpdated = 0;

		// Step 1: Update the primary key on the entity's own table
		try
		{
			let tmpResult = tmpDb
				.prepare(`UPDATE \`${pEntityName}\` SET \`${tmpIDField}\` = :newID WHERE \`${tmpIDField}\` = :oldID`)
				.run({ newID: pNewID, oldID: pOldID });
			tmpTotalUpdated += tmpResult.changes;
			this.log.info(`remapID: Updated ${pEntityName}.${tmpIDField} ${pOldID} → ${pNewID} (${tmpResult.changes} row)`);
		}
		catch (pError)
		{
			this.log.error(`remapID: Error updating ${pEntityName}.${tmpIDField}: ${pError.message}`);
		}

		// Step 2: Update foreign key references in all other entity tables.
		// The FK column name matches the PK column name (e.g., IDObservation
		// in ObservationArtifactJoin references Observation.IDObservation).
		let tmpEntityNames = Object.keys(this._Entities);
		for (let i = 0; i < tmpEntityNames.length; i++)
		{
			let tmpOtherName = tmpEntityNames[i];
			if (tmpOtherName === pEntityName)
			{
				continue;
			}

			let tmpOtherSchema = this._Entities[tmpOtherName].schema;
			if (!tmpOtherSchema || !Array.isArray(tmpOtherSchema.Schema))
			{
				continue;
			}

			// Check if this table has a column matching the PK field name
			let tmpHasFK = false;
			for (let j = 0; j < tmpOtherSchema.Schema.length; j++)
			{
				if (tmpOtherSchema.Schema[j].Column === tmpIDField)
				{
					tmpHasFK = true;
					break;
				}
			}

			if (!tmpHasFK)
			{
				continue;
			}

			try
			{
				let tmpFKResult = tmpDb
					.prepare(`UPDATE \`${tmpOtherName}\` SET \`${tmpIDField}\` = :newID WHERE \`${tmpIDField}\` = :oldID`)
					.run({ newID: pNewID, oldID: pOldID });

				if (tmpFKResult.changes > 0)
				{
					tmpTotalUpdated += tmpFKResult.changes;
					this.log.info(`remapID: Updated FK ${tmpOtherName}.${tmpIDField} ${pOldID} → ${pNewID} (${tmpFKResult.changes} rows)`);
				}
			}
			catch (pError)
			{
				this.log.warn(`remapID: Error updating FK ${tmpOtherName}.${tmpIDField}: ${pError.message}`);
			}
		}

		return tmpTotalUpdated;
	}

	// ========================================================================
	// Dirty Tracking Behaviors
	// ========================================================================

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
	_addDirtyTrackingBehaviors(pEntityName, pMeadowEndpoints)
	{
		let tmpSelf = this;
		let tmpBehaviorInjection = pMeadowEndpoints.controller.BehaviorInjection;

		// Before Create — assign negative ID if enabled.
		// Queries MIN(ID) from the entity's table to find the next
		// available negative ID. This handles persisted negative IDs
		// from previous sessions.
		tmpBehaviorInjection.setBehavior('Create-PreOperation',
			function(pRequest, pRequestState, fBehaviorCallback)
			{
				if (tmpSelf._negativeIDsEnabled && pRequestState.RecordToCreate)
				{
					let tmpIDField = this.DAL.defaultIdentifier;
					let tmpCurrentID = pRequestState.RecordToCreate[tmpIDField];

					// Only assign a negative ID if the record doesn't already have one
					if (!tmpCurrentID || tmpCurrentID === 0)
					{
						let tmpNegID = tmpSelf.getNextNegativeID(pEntityName);
						pRequestState.RecordToCreate[tmpIDField] = tmpNegID;
						tmpSelf.log.info(`Assigned negative ID ${tmpNegID} to new ${pEntityName} record.`);
					}
				}
				return fBehaviorCallback();
			});

		// After query is prepared, enable disableAutoIdentity so
		// FoxHound includes the negative ID in the INSERT statement
		// instead of passing NULL for AUTOINCREMENT.
		tmpBehaviorInjection.setBehavior('Create-QueryConfiguration',
			function(pRequest, pRequestState, fBehaviorCallback)
			{
				if (tmpSelf._negativeIDsEnabled && pRequestState.Query)
				{
					pRequestState.Query.query.disableAutoIdentity = true;
				}
				return fBehaviorCallback();
			});

		// After Create — track the newly created record
		tmpBehaviorInjection.setBehavior('Create-PostOperation',
			function(pRequest, pRequestState, fBehaviorCallback)
			{
				if (pRequestState.Record)
				{
					let tmpIDField = this.DAL.defaultIdentifier;
					let tmpIDValue = pRequestState.Record[tmpIDField];
					tmpSelf._DirtyRecordTracker.trackMutation(pEntityName, tmpIDValue, 'create', pRequestState.Record);
					tmpSelf.log.info(`Tracked create mutation for ${pEntityName} ID ${tmpIDValue}`);
				}
				return fBehaviorCallback();
			});

		// After Update — track the updated record
		tmpBehaviorInjection.setBehavior('Update-PostOperation',
			function(pRequest, pRequestState, fBehaviorCallback)
			{
				if (pRequestState.Record)
				{
					let tmpIDField = this.DAL.defaultIdentifier;
					let tmpIDValue = pRequestState.Record[tmpIDField];
					tmpSelf._DirtyRecordTracker.trackMutation(pEntityName, tmpIDValue, 'update', pRequestState.Record);
					tmpSelf.log.info(`Tracked update mutation for ${pEntityName} ID ${tmpIDValue}`);
				}
				return fBehaviorCallback();
			});

		// After Delete — track the deleted record
		tmpBehaviorInjection.setBehavior('Delete-PostOperation',
			function(pRequest, pRequestState, fBehaviorCallback)
			{
				if (pRequestState.Record)
				{
					let tmpIDField = this.DAL.defaultIdentifier;
					let tmpIDValue = pRequestState.Record[tmpIDField];
					tmpSelf._DirtyRecordTracker.trackMutation(pEntityName, tmpIDValue, 'delete', pRequestState.Record);
					tmpSelf.log.info(`Tracked delete mutation for ${pEntityName} ID ${tmpIDValue}`);
				}
				return fBehaviorCallback();
			});
	}
}

// Explicitly set isFableService — class field inheritance can break in
// some browserify bundles when the parent module is a different copy.
MeadowProviderOffline.isFableService = true;

module.exports = MeadowProviderOffline;
module.exports.serviceType = 'MeadowProviderOffline';
