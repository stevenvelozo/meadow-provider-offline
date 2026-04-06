/**
 * IPC-Orator-Manager - Manages the browser-side Orator IPC instance.
 *
 * Handles:
 *   - Orator initialization in IPC mode (no HTTP server)
 *   - Pre-behavior function for body injection and response method patching
 *   - Route guarding for missing IPC routes
 *   - Body data staging for POST/PUT requests
 *   - Connecting meadow-endpoints routes to the IPC service server
 *
 * The browser-side Orator uses its IPC mode (selected automatically via
 * the `browser` field in orator's package.json). This provides an in-process
 * request routing mechanism that meadow-endpoints can use without HTTP.
 *
 * @license MIT
 */
const libFableServiceBase = require('fable-serviceproviderbase');
const libOrator = require('orator');

/**
 * @class IPCOratorManager
 * @extends libFableServiceBase
 */
class IPCOratorManager extends libFableServiceBase
{
	/**
	 * @param {object} pFable - The Fable instance
	 * @param {object} pOptions - Service options
	 * @param {string} pServiceHash - Service hash
	 */
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'IPCOratorManager';

		/**
		 * The Orator IPC instance.
		 * @type {object|null}
		 */
		this._Orator = null;

		/**
		 * Whether Orator is initialized and started.
		 * @type {boolean}
		 */
		this._started = false;
	}

	/**
	 * Get the Orator IPC instance.
	 *
	 * @returns {object|null}
	 */
	get orator()
	{
		return this._Orator;
	}

	/**
	 * Get the Orator service server.
	 *
	 * @returns {object|null}
	 */
	get serviceServer()
	{
		if (this._Orator)
		{
			return this._Orator.serviceServer;
		}
		return null;
	}

	/**
	 * Whether the IPC Orator is running.
	 *
	 * @returns {boolean}
	 */
	get started()
	{
		return this._started;
	}

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
	initializeAsync(fCallback)
	{
		let tmpSelf = this;

		if (this._started)
		{
			this.log.warn('IPCOratorManager: Already initialized — skipping.');
			return fCallback();
		}

		// Create Orator — auto-selects IPC mode in browser.
		// Set maxParamLength high to handle long filter strings in meadow
		// REST URLs (e.g., FBL~IDEntity~INN~1,2,3,...,600).  The default
		// find-my-way limit of 100 characters silently rejects routes
		// when the :Filter parameter exceeds it.
		this._Orator = new libOrator(this.fable,
			{
				ServiceServerOptions:
				{
					maxParamLength: 100000,
				},
			});

		this._Orator.initialize(
			() =>
			{
				// Add pre-behavior function to:
				// 1. Inject body data staged by the RestClient interceptor
				// 2. Add missing response methods (status, writeHead, header)
				//    that the IPC SynthesizedResponse doesn't provide but
				//    meadow-endpoints expects (they exist on restify responses).
				tmpSelf._Orator.serviceServer.addPreBehaviorFunction(
					(pRequest, pResponse, fNext) =>
					{
						// Inject staged body data
						if (tmpSelf._Orator.serviceServer._pendingRequestBody)
						{
							pRequest.body = tmpSelf._Orator.serviceServer._pendingRequestBody;
							tmpSelf._Orator.serviceServer._pendingRequestBody = null;
						}

						// Patch missing response methods on the IPC SynthesizedResponse.
						if (!pResponse.status)
						{
							pResponse.status = function(pStatusCode)
							{
								pResponse.responseStatus = pStatusCode;
								return pResponse;
							};
						}
						if (!pResponse.writeHead)
						{
							pResponse.writeHead = function(pStatusCode, pHeaders)
							{
								pResponse.responseStatus = pStatusCode;
								return pResponse;
							};
						}
						if (!pResponse.header)
						{
							pResponse.header = function(pName, pValue)
							{
								return pResponse;
							};
						}

						return fNext();
					});

				// Guard the IPC invoke() against routes that don't exist.
				// Without this guard, invoking a non-existent route causes
				// an unhandled error in the router.
				let tmpOriginalInvoke = tmpSelf._Orator.serviceServer.invoke.bind(tmpSelf._Orator.serviceServer);
				tmpSelf._Orator.serviceServer.invoke = function(pMethod, pRoute, pData, fInvokeCallback)
				{
					let tmpHandler = this.router.find(pMethod, pRoute);
					if (!tmpHandler)
					{
						tmpSelf.log.warn(`IPCOratorManager: IPC route not found: ${pMethod} ${pRoute}`);
						if (typeof fInvokeCallback === 'function')
						{
							return fInvokeCallback(new Error(`Route not found: ${pMethod} ${pRoute}`));
						}
						return;
					}
					return tmpOriginalInvoke(pMethod, pRoute, pData, fInvokeCallback);
				};

				// "Start" the IPC server (this is a no-op for IPC but sets Active = true)
				tmpSelf._Orator.startService(
					(pError) =>
					{
						if (pError)
						{
							tmpSelf.log.error('IPCOratorManager: Failed to start IPC', { Error: pError });
						}
						else
						{
							tmpSelf._started = true;
							tmpSelf.log.info('IPCOratorManager: Orator IPC ready.');
						}
						return fCallback(pError);
					});
			});
	}

	/**
	 * Stage body data for the next IPC invoke() call.
	 *
	 * The pre-behavior function will inject this into pRequest.body
	 * and then clear it, so it's consumed exactly once.
	 *
	 * @param {object} pBody - The body data to stage
	 */
	stageBodyData(pBody)
	{
		if (this._Orator && this._Orator.serviceServer)
		{
			this._Orator.serviceServer._pendingRequestBody = pBody;
		}
	}

	/**
	 * Connect meadow-endpoints routes to the IPC service server.
	 *
	 * @param {object} pMeadowEndpoints - A MeadowEndpoints instance
	 */
	connectEntityRoutes(pMeadowEndpoints)
	{
		if (!this._started)
		{
			this.log.error('IPCOratorManager: Cannot connect routes — not started. Call initializeAsync() first.');
			return;
		}

		pMeadowEndpoints.connectRoutes(this._Orator.serviceServer);
	}
}

// Explicitly set isFableService — class field inheritance can break in
// some browserify bundles when the parent module is a different copy.
IPCOratorManager.isFableService = true;

module.exports = IPCOratorManager;
module.exports.serviceType = 'IPCOratorManager';
