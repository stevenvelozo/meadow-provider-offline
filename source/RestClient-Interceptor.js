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
				let tmpResolvedURL = tmpSelf._resolveURL(tmpURL);
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
				let tmpResolvedURL = tmpSelf._resolveURL(tmpURL);
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
	 * Disconnect from the previously connected RestClient.
	 *
	 * Restores the original executeJSONRequest and executeChunkedRequest
	 * functions.
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

		this.log.info('RestClientInterceptor: Disconnected from RestClient.');
		return true;
	}
}

// Explicitly set isFableService — class field inheritance can break in
// some browserify bundles when the parent module is a different copy.
RestClientInterceptor.isFableService = true;

module.exports = RestClientInterceptor;
module.exports.serviceType = 'RestClientInterceptor';
