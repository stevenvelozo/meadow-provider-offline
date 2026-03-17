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
		 * The original executeBinaryUpload function, stashed for restore.
		 * @type {function|null}
		 */
		this._originalExecuteBinaryUpload = null;

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
		 * Each entry stores { restClient, originalExecuteJSONRequest, originalExecuteChunkedRequest, originalExecuteBinaryUpload }.
		 * @type {Array<object>}
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
	/**
	 * Handle an IPC response.  If the IPC Orator returned a "Route not
	 * found" error, optionally fall back to the original (network) REST
	 * client so unhandled routes degrade gracefully to online calls.
	 *
	 * @param {Error|null} pError - Error from IPC invoke
	 * @param {*} pResponseData - Response body from IPC
	 * @param {object} pSynthesizedResponse - Synthesized response object with responseStatus
	 * @param {function} fCallback - Original REST client callback
	 * @param {boolean} pParseJSON - Whether to parse response as JSON
	 * @param {function} [fFallback] - Optional fallback function to call when the IPC route is not found.
	 *        When provided and the IPC returns a route-not-found error, this function is called instead
	 *        of propagating the error — allowing the request to fall through to the real server.
	 */
	_handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, pParseJSON, fFallback)
	{
		if (pError)
		{
			// If a fallback is provided and the error looks like a
			// "route not found" from the IPC Orator, fall through to
			// the original REST client for a real network call.
			if (typeof fFallback === 'function')
			{
				let tmpErrorMsg = (typeof pError === 'string') ? pError : (pError.message || '');
				let tmpIsRouteNotFound = tmpErrorMsg.indexOf('Route not found') >= 0;

				// Also check for error objects with a Route property
				if (!tmpIsRouteNotFound && pResponseData && typeof pResponseData === 'object')
				{
					tmpIsRouteNotFound = pResponseData.Error && typeof pResponseData.Error === 'object'
						&& pResponseData.Error.StatusCode === 404;
				}

				if (tmpIsRouteNotFound)
				{
					this.log.info('RestClientInterceptor: IPC route not found — falling back to network.');
					return fFallback();
				}
			}

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
	 * Check if a resolved URL path is a binary media URL (Artifact/Media).
	 *
	 * Used to distinguish binary URLs (routed to BlobStore) from entity
	 * URLs (routed to IPC) when both match registered prefixes.
	 *
	 * @param {string} pURL - The URL to check (full or resolved pathname)
	 * @returns {boolean} True if the URL matches a binary media pattern
	 * @private
	 */
	_isBinaryURL(pURL)
	{
		let tmpPath = this._resolveURL(pURL);
		return /\/1\.0\/Artifact\/Media\//.test(tmpPath);
	}

	/**
	 * Handle an intercepted binary upload by routing to BlobStore.
	 *
	 * Parses the URL, stores the binary body in BlobStore, tracks the
	 * mutation in DirtyRecordTracker, and returns a success response.
	 *
	 * @param {string} pURL - The request URL
	 * @param {Buffer|Blob|File} pBody - The binary body
	 * @param {string} pContentType - MIME type from Content-Type header
	 * @param {function} fCallback - Callback (pError, pResponse, pBody)
	 * @param {function} [fOnProgress] - Optional progress callback
	 * @private
	 */
	_handleBinaryUpload(pURL, pBody, pContentType, fCallback, fOnProgress)
	{
		let tmpParsed = this._parseBinaryURL(pURL);
		if (!tmpParsed)
		{
			return fCallback(new Error('Could not parse binary upload URL: ' + pURL));
		}

		let tmpBlobKey = `${tmpParsed.entity}:${tmpParsed.id}:v${tmpParsed.version}`;
		let tmpMetadata = {
			mimeType: pContentType,
			fileName: (pBody && ('name' in pBody) ? pBody.name : 'upload'),
			size: (pBody && ('size' in pBody ? pBody.size : ('length' in pBody ? pBody.length : 0))) || 0,
			entityType: tmpParsed.entity,
			entityID: tmpParsed.id,
			version: tmpParsed.version,
			createdAt: new Date().toISOString()
		};

		let tmpSelf = this;

		this._BlobStore.storeBlob(tmpBlobKey, pBody, tmpMetadata,
			(pError) =>
			{
				if (pError)
				{
					return fCallback(pError);
				}

				if (tmpSelf._DirtyTracker)
				{
					tmpSelf._DirtyTracker.trackBinaryMutation(
						tmpParsed.entity, tmpParsed.id, tmpBlobKey, pContentType
					);
				}

				if (typeof fOnProgress === 'function')
				{
					fOnProgress(1.0);
				}

				tmpSelf.log.info(`RestClientInterceptor: Binary upload intercepted → BlobStore [${tmpBlobKey}]`);
				return fCallback(null, { statusCode: 200 }, JSON.stringify({ Success: true }));
			});
	}

	/**
	 * Handle an intercepted binary download by fetching from BlobStore.
	 *
	 * @param {string} pURL - The request URL
	 * @param {function} fCallback - Callback (pError, pResponse, pBody)
	 * @private
	 */
	_handleBinaryDownload(pURL, fCallback)
	{
		let tmpParsed = this._parseBinaryURL(pURL);
		if (!tmpParsed)
		{
			return fCallback(new Error('Could not parse binary download URL: ' + pURL));
		}

		let tmpBlobKey = `${tmpParsed.entity}:${tmpParsed.id}:v${tmpParsed.version}`;
		let tmpSelf = this;

		this._BlobStore.getBlob(tmpBlobKey,
			(pError, pResult) =>
			{
				if (pError || !pResult)
				{
					return fCallback(pError || new Error('Blob not found: ' + tmpBlobKey));
				}
				tmpSelf.log.info(`RestClientInterceptor: Binary download intercepted ← BlobStore [${tmpBlobKey}]`);
				return fCallback(null, { statusCode: 200 }, pResult.blob);
			});
	}

	/**
	 * Connect to a RestClient, wrapping executeJSONRequest,
	 * executeChunkedRequest, and executeBinaryUpload with interception logic.
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
		if (typeof pRestClient.executeBinaryUpload === 'function')
		{
			this._originalExecuteBinaryUpload = pRestClient.executeBinaryUpload.bind(pRestClient);
		}
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
						tmpSelf._handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, true,
							function ()
							{
								// Fallback: IPC had no route — pass through to network
								return tmpSelf._originalExecuteJSONRequest(pOptions, fCallback);
							});
					});
			}
			else
			{
				// Pass through to original
				return tmpSelf._originalExecuteJSONRequest(pOptions, fCallback);
			}
		};

		// Replace executeChunkedRequest with interception wrapper
		// Binary download URLs (Artifact/Media) are routed to BlobStore;
		// entity URLs are routed to IPC.
		pRestClient.executeChunkedRequest = function(pOptions, fCallback)
		{
			let tmpOptions = pRestClient.preRequest(pOptions);
			let tmpURL = tmpOptions.url || '';

			if (tmpSelf.shouldIntercept(tmpURL))
			{
				// Binary download → BlobStore (if BlobStore is connected)
				if (tmpSelf._BlobStore && tmpSelf._isBinaryURL(tmpURL))
				{
					return tmpSelf._handleBinaryDownload(tmpURL, fCallback);
				}

				// Entity request → IPC
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
						tmpSelf._handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, false,
							function ()
							{
								return tmpSelf._originalExecuteChunkedRequest(pOptions, fCallback);
							});
					});
			}
			else
			{
				return tmpSelf._originalExecuteChunkedRequest(pOptions, fCallback);
			}
		};

		// Replace executeBinaryUpload with interception wrapper (if available)
		if (this._originalExecuteBinaryUpload)
		{
			pRestClient.executeBinaryUpload = function(pOptions, fCallback, fOnProgress)
			{
				let tmpOptions = pRestClient.preRequest(pOptions);
				let tmpURL = tmpOptions.url || '';

				if (tmpSelf.shouldIntercept(tmpURL) && tmpSelf._BlobStore)
				{
					let tmpContentType = (tmpOptions.headers && tmpOptions.headers['Content-Type']) || 'application/octet-stream';
					return tmpSelf._handleBinaryUpload(tmpURL, pOptions.body, tmpContentType, fCallback, fOnProgress);
				}
				else
				{
					return tmpSelf._originalExecuteBinaryUpload(pOptions, fCallback, fOnProgress);
				}
			};
		}

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
		let tmpOriginalExecuteBinaryUpload = (typeof pRestClient.executeBinaryUpload === 'function')
			? pRestClient.executeBinaryUpload.bind(pRestClient)
			: null;

		this._additionalRestClients.push({
			restClient: pRestClient,
			originalExecuteJSONRequest: tmpOriginalExecuteJSON,
			originalExecuteChunkedRequest: tmpOriginalExecuteChunked,
			originalExecuteBinaryUpload: tmpOriginalExecuteBinaryUpload
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
						tmpSelf._handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, true,
							function ()
							{
								return tmpOriginalExecuteJSON(pOptions, fCallback);
							});
					});
			}
			else
			{
				return tmpOriginalExecuteJSON(pOptions, fCallback);
			}
		};

		// Wrap executeChunkedRequest (with binary download awareness)
		pRestClient.executeChunkedRequest = function(pOptions, fCallback)
		{
			let tmpOptions = pRestClient.preRequest(pOptions);
			let tmpURL = tmpOptions.url || '';

			if (tmpSelf.shouldIntercept(tmpURL))
			{
				// Binary download → BlobStore
				if (tmpSelf._BlobStore && tmpSelf._isBinaryURL(tmpURL))
				{
					return tmpSelf._handleBinaryDownload(tmpURL, fCallback);
				}

				// Entity request → IPC
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
						tmpSelf._handleIPCResponse(pError, pResponseData, pSynthesizedResponse, fCallback, false,
							function ()
							{
								return tmpOriginalExecuteChunked(pOptions, fCallback);
							});
					});
			}
			else
			{
				return tmpOriginalExecuteChunked(pOptions, fCallback);
			}
		};

		// Wrap executeBinaryUpload — or ADD it if the RestClient doesn't
		// have one natively (common in browser environments).  When BlobStore
		// is connected, intercepted binary uploads are routed to IndexedDB.
		// When there's no BlobStore and no original function, the upload is
		// a no-op with an error callback.
		{
			pRestClient.executeBinaryUpload = function(pOptions, fCallback, fOnProgress)
			{
				let tmpOptions = pRestClient.preRequest(pOptions);
				let tmpURL = tmpOptions.url || '';

				if (tmpSelf.shouldIntercept(tmpURL) && tmpSelf._BlobStore)
				{
					let tmpContentType = (tmpOptions.headers && tmpOptions.headers['Content-Type']) || 'application/octet-stream';
					return tmpSelf._handleBinaryUpload(tmpURL, pOptions.body, tmpContentType, fCallback, fOnProgress);
				}
				else if (tmpOriginalExecuteBinaryUpload)
				{
					return tmpOriginalExecuteBinaryUpload(pOptions, fCallback, fOnProgress);
				}
				else
				{
					// No original and no BlobStore — cannot upload
					let tmpError = new Error('executeBinaryUpload: no binary upload handler available');
					tmpSelf.log.warn(tmpError.message);
					if (typeof fCallback === 'function')
					{
						return fCallback(tmpError);
					}
				}
			};
		}

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
		if (this._originalExecuteBinaryUpload)
		{
			tmpRestClient.executeBinaryUpload = this._originalExecuteBinaryUpload;
		}

		this._connectedRestClient = null;
		this._originalExecuteJSONRequest = null;
		this._originalExecuteChunkedRequest = null;
		this._originalExecuteBinaryUpload = null;
		this._IPCOratorManager = null;

		// Disconnect additional RestClients
		for (let i = 0; i < this._additionalRestClients.length; i++)
		{
			let tmpEntry = this._additionalRestClients[i];
			tmpEntry.restClient.executeJSONRequest = tmpEntry.originalExecuteJSONRequest;
			tmpEntry.restClient.executeChunkedRequest = tmpEntry.originalExecuteChunkedRequest;
			if (tmpEntry.originalExecuteBinaryUpload)
			{
				tmpEntry.restClient.executeBinaryUpload = tmpEntry.originalExecuteBinaryUpload;
			}
		}
		this._additionalRestClients = [];

		// Also clear binary references
		this.disconnectBinary();

		this.log.info('RestClientInterceptor: Disconnected from RestClient.');
		return true;
	}

	// ========================================================================
	// Binary Interception
	// ========================================================================

	/**
	 * Enable binary interception (BlobStore routing) on already-connected
	 * RestClients.
	 *
	 * Binary interception is handled at the RestClient level — the
	 * executeChunkedRequest wrapper routes binary download URLs to
	 * BlobStore, and the executeBinaryUpload wrapper routes binary
	 * upload URLs to BlobStore. This method simply stores the BlobStore
	 * and DirtyRecordTracker references that those wrappers check.
	 *
	 * Must be called after connect() — the RestClient wrappers must
	 * already be in place for binary routing to work.
	 *
	 * @param {object} pBlobStoreManager - BlobStoreManager instance for IndexedDB storage
	 * @param {object} pDirtyRecordTracker - DirtyRecordTracker instance for mutation tracking
	 */
	connectBinary(pBlobStoreManager, pDirtyRecordTracker)
	{
		if (!pBlobStoreManager)
		{
			this.log.error('RestClientInterceptor.connectBinary: Missing BlobStoreManager.');
			return;
		}

		this._BlobStore = pBlobStoreManager;
		this._DirtyTracker = pDirtyRecordTracker || null;

		this.log.info('RestClientInterceptor: Binary interception enabled (BlobStore connected).');
	}

	/**
	 * Disable binary interception.
	 *
	 * Clears BlobStore and DirtyRecordTracker references so the
	 * RestClient wrappers fall through to IPC or network for binary URLs.
	 *
	 * @returns {boolean} True if references were cleared
	 */
	disconnectBinary()
	{
		if (!this._BlobStore)
		{
			return false;
		}

		this._BlobStore = null;
		this._DirtyTracker = null;

		this.log.info('RestClientInterceptor: Binary interception disabled.');
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
