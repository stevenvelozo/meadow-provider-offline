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

						tmpSelf.initialized = true;
						tmpSelf.log.info('MeadowProviderOffline: Initialized successfully.');
						return fCallback();
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
				tmpSelf._RestClientInterceptor.registerPrefix(tmpEndpointPrefix);

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
	 * @param {object} [pRestClient] - A Fable RestClient instance. If not provided,
	 *                                  attempts to use fable.RestClient.
	 */
	connect(pRestClient)
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
	// Dirty Tracking Behaviors
	// ========================================================================

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
	_addDirtyTrackingBehaviors(pEntityName, pMeadowEndpoints)
	{
		let tmpSelf = this;
		let tmpBehaviorInjection = pMeadowEndpoints.controller.BehaviorInjection;

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
