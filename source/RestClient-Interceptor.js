/**
 * RestClient-Interceptor - Wraps executeJSONRequest on an existing
 * Fable RestClient to intercept matching requests and route them
 * through Orator IPC instead of HTTP.
 *
 * Follows the same connect/disconnect pattern as pict-sessionmanager
 * (save original → wrap → restore), but at a higher interception point:
 *
 *   pict-sessionmanager wraps prepareRequestOptions() for header injection.
 *   This interceptor wraps executeJSONRequest() to short-circuit the
 *   entire HTTP pipeline for matching URL patterns.
 *
 * Non-matching URLs pass through to the original RestClient implementation,
 * preserving all other REST traffic (auth, external APIs, etc.).
 *
 * @license MIT
 */
const libFableServiceBase = require('fable-serviceproviderbase');

/**
 * @class RestClientInterceptor
 * @extends libFableServiceBase
 */
class RestClientInterceptor extends libFableServiceBase
{
	/**
	 * @param {object} pFable - The Fable instance
	 * @param {object} pOptions - Service options
	 * @param {string} pServiceHash - Service hash
	 */
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'RestClientInterceptor';

		/**
		 * The original executeJSONRequest function, stashed for restore.
		 * @type {function|null}
		 */
		this._originalExecuteJSONRequest = null;

		/**
		 * The original executeChunkedRequest function, stashed for restore.
		 * @type {function|null}
		 */
		this._originalExecuteChunkedRequest = null;

		/**
		 * The RestClient instance we are connected to.
		 * @type {object|null}
		 */
		this._connectedRestClient = null;

		/**
		 * The IPC Orator Manager for routing intercepted requests.
		 * @type {object|null}
		 */
		this._IPCOratorManager = null;

		/**
		 * Registered URL prefixes that should be intercepted.
		 * Each entry maps an entity endpoint prefix to true.
		 * @type {Record<string, boolean>}
		 */
		this._registeredPrefixes = {};

		// === Binary interception state ===

		/**
		 * The HeadlightRestClient instance we are binary-connected to.
		 * @type {object|null}
		 */
		this._connectedHeadlightRestClient = null;

		/**
		 * The original postBinary function, stashed for restore.
		 * @type {function|null}
		 */
		this._originalPostBinary = null;

		/**
		 * The original getBinaryBlob function, stashed for restore.
		 * @type {function|null}
		 */
		this._originalGetBinaryBlob = null;

		/**
		 * The BlobStoreManager for binary storage.
		 * @type {object|null}
		 */
		this._BlobStore = null;

		/**
		 * The DirtyRecordTracker for binary mutation tracking.
		 * @type {object|null}
		 */
		this._DirtyTracker = null;

		/**
		 * Additional RestClient instances that have been wrapped.
		 * Each entry stores { restClient, originalExecuteJSONRequest, originalExecuteChunkedRequest }.
		 * @type {Array<{ restClient: object, originalExecuteJSONRequest: function, originalExecuteChunkedRequest: function }>}
		 */
		this._additionalRestClients = [];
	}

	/**
	 * Register a URL prefix for interception.
	 *
	 * When a request URL path starts with this prefix, it will be
	 * routed through IPC instead of HTTP.
	 *
	 * @param {string} pPrefix - URL path prefix (e.g., '/1.0/Book')
	 */
	registerPrefix(pPrefix)
	{
		this._registeredPrefixes[pPrefix] = true;
		this.log.info(`RestClientInterceptor: Registered prefix ${pPrefix}`);
	}

	/**
	 * Unregister a URL prefix.
	 *
	 * @param {string} pPrefix - URL path prefix to unregister
	 */
	unregisterPrefix(pPrefix)
	{
		delete this._registeredPrefixes[pPrefix];
		this.log.info(`RestClientInterceptor: Unregistered prefix ${pPrefix}`);
	}

	/**
	 * Check if a URL should be intercepted.
	 *
	 * Extracts the pathname from the URL and checks if it starts with
	 * any registered prefix.
	 *
	 * @param {string} pURL - The request URL
	 * @returns {boolean} True if the URL should be intercepted
	 */
	shouldIntercept(pURL)
	{
		let tmpPath = this._resolveURL(pURL);
		let tmpPrefixes = Object.keys(this._registeredPrefixes);

		for (let i = 0; i < tmpPrefixes.length; i++)
		{
			if (tmpPath.startsWith(tmpPrefixes[i]))
			{
				return true;
			}
		}

		return false;
	}

	/**
	 * Resolve the URL to a pathname by stripping any absolute URL prefix.
	 *
	 * Handles URLs like 'http://localhost:8086/1.0/Books/0/10' → '/1.0/Books/0/10'
	 *
	 * @param {string} pURL - The URL to resolve
	 * @returns {string} The pathname portion of the URL
	 * @private
	 */
	_resolveURL(pURL)
	{
		if (pURL && pURL.startsWith('http'))
		{
			try
			{
				let tmpURLObj = new URL(pURL);
				return tmpURLObj.pathname + tmpURLObj.search;
			}
			catch (pErr)
			{
				// Fall through to return as-is
			}
		}
		return pURL;
	}

	/**
	 * Normalize a URL for IPC route matching.
	 *
	 * Resolves the URL to a pathname and strips any trailing slash.
	 * Meadow-endpoints registers routes without trailing slashes
	 * (e.g., PUT /1.0/Document) but some clients send URLs with
	 * trailing slashes (e.g., PUT /1.0/Document/).
	 *
	 * @param {string} pURL - The URL to normalize
	 * @returns {string} Normalized pathname suitable for IPC invoke
	 * @private
	 */
	_normalizeRouteURL(pURL)
	{
		let tmpPath = this._resolveURL(pURL);
		// Strip trailing slash (but never reduce to empty string)
		if (tmpPath && tmpPath.length > 1 && tmpPath.endsWith('/'))
		{
			tmpPath = tmpPath.slice(0, -1);
		}
		return tmpPath;
	}

	/**
	 * Parse the IPC response into the format expected by RestClient consumers.
	 *
	 * Converts the IPC synthesized response into a { statusCode, body } format
	 * that matches what simple-get returns, ensuring compatibility with all
	 * existing RestClient consumers (PictMeadowEntityProvider, etc.).
	 *
	 * @param {Error|null} pError - Error from IPC invoke
	 * @param {string|object} pResponseData - Response data from IPC
	 * @param {object} pSynthesizedResponse - The IPC synthesized response object
	 * @param {function} fCallback - Callback with (error, response, body)
	 * @param {boolean} pParseJSON - Whether to JSON.parse the response data
	 * @private
	 */
	_handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, pParseJSON)
	{
		if (pError)
		{
			return fCallback(pError);
		}

		let tmpBody = pResponseData;
		if (pParseJSON && typeof(pResponseData) === 'string')
		{
			try
			{
				tmpBody = JSON.parse(pResponseData);
			}
			catch (pParseError)
			{
				// If it's not valid JSON, return as-is
				tmpBody = pResponseData;
			}
		}

		let tmpResponse = {
			statusCode: (pSynthesizedResponse && pSynthesizedResponse.responseStatus >= 0)
				? pSynthesizedResponse.responseStatus
				: 200
		};

		return fCallback(null, tmpResponse, tmpBody);
	}

	/**
	 * Connect to a RestClient, wrapping executeJSONRequest and
	 * executeChunkedRequest with interception logic.
	 *
	 * @param {object} pRestClient - A Fable RestClient service instance
	 * @param {object} pIPCOratorManager - The IPC Orator Manager instance
	 */
	connect(pRestClient, pIPCOratorManager)
	{
		if (!pRestClient)
		{
			this.log.error('RestClientInterceptor.connect: No RestClient provided.');
			return;
		}

		if (!pIPCOratorManager)
		{
			this.log.error('RestClientInterceptor.connect: No IPCOratorManager provided.');
			return;
		}

		if (this._connectedRestClient)
		{
			this.log.warn('RestClientInterceptor: Already connected. Disconnecting first.');
			this.disconnect();
		}

		this._IPCOratorManager = pIPCOratorManager;

		// Stash originals
		this._originalExecuteJSONRequest = pRestClient.executeJSONRequest.bind(pRestClient);
		this._originalExecuteChunkedRequest = pRestClient.executeChunkedRequest.bind(pRestClient);
		this._connectedRestClient = pRestClient;

		let tmpSelf = this;

		// Replace executeJSONRequest with interception wrapper
		pRestClient.executeJSONRequest = function(pOptions, fCallback)
		{
			// Run prepareRequestOptions first so session headers etc. are applied
			// (pict-sessionmanager wraps this, so it may inject auth tokens)
			let tmpOptions = pRestClient.preRequest(pOptions);
			let tmpURL = tmpOptions.url || '';

			if (tmpSelf.shouldIntercept(tmpURL))
			{
				let tmpResolvedURL = tmpSelf._normalizeRouteURL(tmpURL);
				let tmpMethod = tmpOptions.method || 'GET';

				// Stage body data for POST/PUT/PATCH
				if (tmpOptions.body && typeof(tmpOptions.body) === 'object')
				{
					tmpSelf._IPCOratorManager.stageBodyData(tmpOptions.body);
				}

				tmpSelf._IPCOratorManager.orator.serviceServer.invoke(
					tmpMethod, tmpResolvedURL, null,
					(pError, pResponseData, pSynthesizedResponse) =>
					{
						tmpSelf._handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, true);
					});
			}
			else
			{
				// Pass through to original
				return tmpSelf._originalExecuteJSONRequest(pOptions, fCallback);
			}
		};

		// Replace executeChunkedRequest with interception wrapper
		pRestClient.executeChunkedRequest = function(pOptions, fCallback)
		{
			let tmpOptions = pRestClient.preRequest(pOptions);
			let tmpURL = tmpOptions.url || '';

			if (tmpSelf.shouldIntercept(tmpURL))
			{
				let tmpResolvedURL = tmpSelf._normalizeRouteURL(tmpURL);
				let tmpMethod = tmpOptions.method || 'GET';

				if (tmpOptions.body && typeof(tmpOptions.body) === 'object')
				{
					tmpSelf._IPCOratorManager.stageBodyData(tmpOptions.body);
				}

				tmpSelf._IPCOratorManager.orator.serviceServer.invoke(
					tmpMethod, tmpResolvedURL, null,
					(pError, pResponseData, pSynthesizedResponse) =>
					{
						// For chunked requests, don't parse JSON
						tmpSelf._handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, false);
					});
			}
			else
			{
				return tmpSelf._originalExecuteChunkedRequest(pOptions, fCallback);
			}
		};

		this.log.info('RestClientInterceptor: Connected to RestClient.');
	}

	/**
	 * Connect an additional RestClient for interception.
	 *
	 * Some services (e.g., HeadlightRestClient) maintain their own
	 * internal RestClient instance separate from fable.RestClient.
	 * This method wraps that additional RestClient with the same
	 * interception logic so all HTTP calls through it are also routed
	 * through IPC when matching registered prefixes.
	 *
	 * Must be called after connect() — requires _IPCOratorManager to be set.
	 *
	 * @param {object} pRestClient - An additional Fable RestClient service instance
	 */
	connectAdditionalRestClient(pRestClient)
	{
		if (!pRestClient)
		{
			this.log.error('RestClientInterceptor.connectAdditionalRestClient: No RestClient provided.');
			return;
		}

		if (!this._IPCOratorManager)
		{
			this.log.error('RestClientInterceptor.connectAdditionalRestClient: Must call connect() first.');
			return;
		}

		// Check if this RestClient is already connected (primary or additional)
		if (pRestClient === this._connectedRestClient)
		{
			this.log.info('RestClientInterceptor: Additional RestClient is already the primary — skipping.');
			return;
		}
		for (let i = 0; i < this._additionalRestClients.length; i++)
		{
			if (this._additionalRestClients[i].restClient === pRestClient)
			{
				this.log.info('RestClientInterceptor: Additional RestClient already connected — skipping.');
				return;
			}
		}

		// Stash originals
		let tmpOriginalExecuteJSON = pRestClient.executeJSONRequest.bind(pRestClient);
		let tmpOriginalExecuteChunked = pRestClient.executeChunkedRequest.bind(pRestClient);

		this._additionalRestClients.push({
			restClient: pRestClient,
			originalExecuteJSONRequest: tmpOriginalExecuteJSON,
			originalExecuteChunkedRequest: tmpOriginalExecuteChunked
		});

		let tmpSelf = this;

		// Wrap executeJSONRequest
		pRestClient.executeJSONRequest = function(pOptions, fCallback)
		{
			let tmpOptions = pRestClient.preRequest(pOptions);
			let tmpURL = tmpOptions.url || '';

			if (tmpSelf.shouldIntercept(tmpURL))
			{
				let tmpResolvedURL = tmpSelf._normalizeRouteURL(tmpURL);
				let tmpMethod = tmpOptions.method || 'GET';

				if (tmpOptions.body && typeof(tmpOptions.body) === 'object')
				{
					tmpSelf._IPCOratorManager.stageBodyData(tmpOptions.body);
				}

				tmpSelf._IPCOratorManager.orator.serviceServer.invoke(
					tmpMethod, tmpResolvedURL, null,
					(pError, pResponseData, pSynthesizedResponse) =>
					{
						tmpSelf._handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, true);
					});
			}
			else
			{
				return tmpOriginalExecuteJSON(pOptions, fCallback);
			}
		};

		// Wrap executeChunkedRequest
		pRestClient.executeChunkedRequest = function(pOptions, fCallback)
		{
			let tmpOptions = pRestClient.preRequest(pOptions);
			let tmpURL = tmpOptions.url || '';

			if (tmpSelf.shouldIntercept(tmpURL))
			{
				let tmpResolvedURL = tmpSelf._normalizeRouteURL(tmpURL);
				let tmpMethod = tmpOptions.method || 'GET';

				if (tmpOptions.body && typeof(tmpOptions.body) === 'object')
				{
					tmpSelf._IPCOratorManager.stageBodyData(tmpOptions.body);
				}

				tmpSelf._IPCOratorManager.orator.serviceServer.invoke(
					tmpMethod, tmpResolvedURL, null,
					(pError, pResponseData, pSynthesizedResponse) =>
					{
						tmpSelf._handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, false);
					});
			}
			else
			{
				return tmpOriginalExecuteChunked(pOptions, fCallback);
			}
		};

		this.log.info(`RestClientInterceptor: Connected additional RestClient (${pRestClient.Hash || 'unknown'}).`);
	}

	/**
	 * Disconnect from the previously connected RestClient.
	 *
	 * Restores the original executeJSONRequest and executeChunkedRequest
	 * functions. Also disconnects binary interception and additional
	 * RestClients if connected.
	 *
	 * @param {object} [pRestClient] - Optional; if not provided, disconnects the previously connected RestClient
	 * @returns {boolean} True if successfully disconnected
	 */
	disconnect(pRestClient)
	{
		let tmpRestClient = pRestClient || this._connectedRestClient;

		if (!tmpRestClient || !this._originalExecuteJSONRequest)
		{
			this.log.warn('RestClientInterceptor.disconnect: No connected RestClient to disconnect.');
			return false;
		}

		tmpRestClient.executeJSONRequest = this._originalExecuteJSONRequest;
		tmpRestClient.executeChunkedRequest = this._originalExecuteChunkedRequest;

		this._connectedRestClient = null;
		this._originalExecuteJSONRequest = null;
		this._originalExecuteChunkedRequest = null;
		this._IPCOratorManager = null;

		// Disconnect additional RestClients
		for (let i = 0; i < this._additionalRestClients.length; i++)
		{
			let tmpEntry = this._additionalRestClients[i];
			tmpEntry.restClient.executeJSONRequest = tmpEntry.originalExecuteJSONRequest;
			tmpEntry.restClient.executeChunkedRequest = tmpEntry.originalExecuteChunkedRequest;
		}
		this._additionalRestClients = [];

		// Also disconnect binary interception if connected
		if (this._connectedHeadlightRestClient)
		{
			this.disconnectBinary();
		}

		this.log.info('RestClientInterceptor: Disconnected from RestClient.');
		return true;
	}

	// ========================================================================
	// Binary Interception
	// ========================================================================

	/**
	 * Connect binary interception to a HeadlightRestClient.
	 *
	 * Wraps postBinary() and getBinaryBlob() on the HeadlightRestClient
	 * to intercept matching URLs and route them to the BlobStore instead
	 * of making network requests.
	 *
	 * This is separate from connect() to keep the existing JSON interception
	 * on the Fable RestClient unchanged.
	 *
	 * @param {object} pHeadlightRestClient - HeadlightRestClient with postBinary/getBinaryBlob methods
	 * @param {object} pBlobStoreManager - BlobStoreManager instance for IndexedDB storage
	 * @param {object} pDirtyRecordTracker - DirtyRecordTracker instance for mutation tracking
	 */
	connectBinary(pHeadlightRestClient, pBlobStoreManager, pDirtyRecordTracker)
	{
		if (!pHeadlightRestClient || !pBlobStoreManager)
		{
			this.log.error('RestClientInterceptor.connectBinary: Missing required references.');
			return;
		}

		if (this._connectedHeadlightRestClient)
		{
			this.log.warn('RestClientInterceptor: Binary already connected. Disconnecting first.');
			this.disconnectBinary();
		}

		this._BlobStore = pBlobStoreManager;
		this._DirtyTracker = pDirtyRecordTracker;
		this._connectedHeadlightRestClient = pHeadlightRestClient;

		// Stash originals
		this._originalPostBinary = pHeadlightRestClient.postBinary.bind(pHeadlightRestClient);
		this._originalGetBinaryBlob = pHeadlightRestClient.getBinaryBlob.bind(pHeadlightRestClient);

		let tmpSelf = this;

		// Wrap postBinary — intercept binary uploads to BlobStore
		pHeadlightRestClient.postBinary = function(pURL, pFile, pMimeType, fCallback, fOnProgress)
		{
			let tmpFormattedURL = pHeadlightRestClient.formatUrl(pURL, true);

			if (tmpSelf.shouldIntercept(tmpFormattedURL))
			{
				// Parse URL: /1.0/Artifact/Media/{IDArtifact}/{Version}
				let tmpParsed = tmpSelf._parseBinaryURL(tmpFormattedURL);
				if (!tmpParsed)
				{
					return fCallback(new Error('Could not parse binary upload URL: ' + pURL));
				}

				let tmpBlobKey = `${tmpParsed.entity}:${tmpParsed.id}:v${tmpParsed.version}`;
				let tmpMetadata = {
					mimeType: pMimeType,
					fileName: (pFile && pFile.name) || 'upload',
					size: (pFile && pFile.size) || 0,
					entityType: tmpParsed.entity,
					entityID: tmpParsed.id,
					version: tmpParsed.version,
					createdAt: new Date().toISOString()
				};

				tmpSelf._BlobStore.storeBlob(tmpBlobKey, pFile, tmpMetadata,
					(pError) =>
					{
						if (pError)
						{
							return fCallback(pError);
						}

						// Track binary mutation for later sync
						if (tmpSelf._DirtyTracker)
						{
							tmpSelf._DirtyTracker.trackBinaryMutation(
								tmpParsed.entity, tmpParsed.id, tmpBlobKey, pMimeType
							);
						}

						// Simulate instant completion
						if (fOnProgress)
						{
							fOnProgress(1.0);
						}
						tmpSelf.log.info(`RestClientInterceptor: Binary upload intercepted → BlobStore [${tmpBlobKey}]`);
						return fCallback(null, { Success: true });
					});
			}
			else
			{
				return tmpSelf._originalPostBinary(pURL, pFile, pMimeType, fCallback, fOnProgress);
			}
		};

		// Wrap getBinaryBlob — intercept binary downloads from BlobStore
		pHeadlightRestClient.getBinaryBlob = function(pURL, fCallback)
		{
			let tmpFormattedURL = pHeadlightRestClient.formatUrl(pURL, true);

			if (tmpSelf.shouldIntercept(tmpFormattedURL))
			{
				let tmpParsed = tmpSelf._parseBinaryURL(tmpFormattedURL);
				if (!tmpParsed)
				{
					return fCallback(new Error('Could not parse binary download URL: ' + pURL));
				}

				let tmpBlobKey = `${tmpParsed.entity}:${tmpParsed.id}:v${tmpParsed.version}`;
				tmpSelf._BlobStore.getBlob(tmpBlobKey,
					(pError, pResult) =>
					{
						if (pError || !pResult)
						{
							return fCallback(pError || new Error('Blob not found: ' + tmpBlobKey));
						}
						tmpSelf.log.info(`RestClientInterceptor: Binary download intercepted ← BlobStore [${tmpBlobKey}]`);
						return fCallback(null, pResult.blob);
					});
			}
			else
			{
				return tmpSelf._originalGetBinaryBlob(pURL, fCallback);
			}
		};

		this.log.info('RestClientInterceptor: Binary interception connected.');
	}

	/**
	 * Disconnect binary interception from HeadlightRestClient.
	 *
	 * Restores the original postBinary and getBinaryBlob functions.
	 *
	 * @returns {boolean} True if successfully disconnected
	 */
	disconnectBinary()
	{
		if (!this._connectedHeadlightRestClient || !this._originalPostBinary)
		{
			this.log.warn('RestClientInterceptor.disconnectBinary: No connected HeadlightRestClient to disconnect.');
			return false;
		}

		this._connectedHeadlightRestClient.postBinary = this._originalPostBinary;
		this._connectedHeadlightRestClient.getBinaryBlob = this._originalGetBinaryBlob;

		this._connectedHeadlightRestClient = null;
		this._originalPostBinary = null;
		this._originalGetBinaryBlob = null;
		this._BlobStore = null;
		this._DirtyTracker = null;

		this.log.info('RestClientInterceptor: Binary interception disconnected.');
		return true;
	}

	/**
	 * Parse a binary media URL to extract entity type, ID, and version.
	 *
	 * Handles URLs like:
	 *   /1.0/Artifact/Media/{IDArtifact}/{Version}
	 *   http://server/1.0/Artifact/Media/123/1
	 *
	 * @param {string} pURL - The full or relative URL
	 * @returns {{ entity: string, id: string|number, version: string|number }|null}
	 * @private
	 */
	_parseBinaryURL(pURL)
	{
		let tmpPath = this._resolveURL(pURL);

		// Match: /1.0/Artifact/Media/{IDArtifact}/{Version}
		let tmpMatch = tmpPath.match(/\/1\.0\/Artifact\/Media\/(\d+)\/(\d+)/);
		if (tmpMatch)
		{
			return {
				entity: 'Artifact',
				id: tmpMatch[1],
				version: tmpMatch[2]
			};
		}

		// Match: /1.0/Artifact/Media/{IDArtifact} (no version, default to 1)
		tmpMatch = tmpPath.match(/\/1\.0\/Artifact\/Media\/(\d+)$/);
		if (tmpMatch)
		{
			return {
				entity: 'Artifact',
				id: tmpMatch[1],
				version: '1'
			};
		}

		this.log.warn(`RestClientInterceptor._parseBinaryURL: Could not parse URL: ${pURL}`);
		return null;
	}
}

// Explicitly set isFableService — class field inheritance can break in
// some browserify bundles when the parent module is a different copy.
RestClientInterceptor.isFableService = true;

module.exports = RestClientInterceptor;
module.exports.serviceType = 'RestClientInterceptor';
