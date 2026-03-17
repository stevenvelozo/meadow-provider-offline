/**
* Tests for RestClient-Interceptor binary interception.
*
* Covers: executeBinaryUpload wrapping, executeChunkedRequest binary
* download routing, connectBinary/disconnectBinary, _parseBinaryURL,
* _isBinaryURL, connectAdditionalRestClient binary wrapping, and
* disconnect restore behavior.
*
* Uses mock BlobStore and RestClient — no real HTTP server needed
* since we are testing the interceptor's routing logic.
*
* @license MIT
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');

const libDirtyRecordTracker = require('../source/Dirty-Record-Tracker.js');
const libRestClientInterceptor = require('../source/RestClient-Interceptor.js');

const _FableConfig =
{
	'Product': 'RestClientInterceptorBinaryTest',
	'ProductVersion': '0.0.1',
	'UUID':
	{
		'DataCenter': 0,
		'Worker': 0
	},
	'LogStreams':
	[
		{
			'streamtype': 'console'
		}
	]
};

/**
* Helper: create an interceptor with a mock BlobStore,
* DirtyRecordTracker, RestClient, and IPC manager.
*
* @returns {object} Fixture with interceptor, blobStore, dirtyTracker, mockRestClient, etc.
*/
function createBinaryInterceptorFixture()
{
	let tmpFable = new libFable(_FableConfig);
	tmpFable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
	tmpFable.serviceManager.addServiceType('DirtyRecordTracker', libDirtyRecordTracker);

	let tmpInterceptor = tmpFable.serviceManager.instantiateServiceProvider('RestClientInterceptor');
	let tmpDirtyTracker = tmpFable.serviceManager.instantiateServiceProvider('DirtyRecordTracker');

	// In-memory mock BlobStore
	let tmpBlobStorage = {};
	let tmpMockBlobStore =
	{
		storeBlob: (pKey, pBlobData, pMetadata, fCallback) =>
		{
			tmpBlobStorage[pKey] = { blob: pBlobData, metadata: pMetadata };
			fCallback(null);
		},
		getBlob: (pKey, fCallback) =>
		{
			if (tmpBlobStorage[pKey])
			{
				fCallback(null, tmpBlobStorage[pKey]);
			}
			else
			{
				fCallback(null, null);
			}
		},
		_storage: tmpBlobStorage
	};

	// Track which original methods were called
	let tmpOriginalCalls = { json: 0, chunked: 0, binaryUpload: 0 };

	// Mock RestClient with executeBinaryUpload
	let tmpMockRestClient =
	{
		preRequest: (pOptions) => pOptions,
		executeJSONRequest: (pOptions, fCallback) =>
		{
			tmpOriginalCalls.json++;
			fCallback(null, { statusCode: 200 }, { mock: true });
		},
		executeChunkedRequest: (pOptions, fCallback) =>
		{
			tmpOriginalCalls.chunked++;
			fCallback(null, { statusCode: 200 }, 'mock-chunked-data');
		},
		executeBinaryUpload: (pOptions, fCallback, fOnProgress) =>
		{
			tmpOriginalCalls.binaryUpload++;
			if (typeof fOnProgress === 'function')
			{
				fOnProgress(1.0);
			}
			fCallback(null, { statusCode: 200 }, '{"Success":true,"Source":"network"}');
		}
	};

	// Mock IPC Orator Manager
	let tmpMockIPCManager =
	{
		stageBodyData: () => {},
		orator:
		{
			serviceServer:
			{
				invoke: (pMethod, pURL, pQuery, fCallback) =>
				{
					fCallback(null, '{"ipc":true}', { responseStatus: 200 });
				}
			}
		}
	};

	return {
		interceptor: tmpInterceptor,
		fable: tmpFable,
		blobStore: tmpMockBlobStore,
		dirtyTracker: tmpDirtyTracker,
		mockRestClient: tmpMockRestClient,
		mockIPCManager: tmpMockIPCManager,
		originalCalls: tmpOriginalCalls
	};
}

suite
(
	'RestClient-Interceptor Binary',
	function ()
	{
		// ==================================================================
		// _parseBinaryURL
		// ==================================================================
		suite
		(
			'_parseBinaryURL',
			function ()
			{
				test
				(
					'Should parse Artifact/Media URLs with ID and version.',
					function ()
					{
						let tmpFixture = createBinaryInterceptorFixture();

						let tmpResult = tmpFixture.interceptor._parseBinaryURL('/1.0/Artifact/Media/42/3');
						Expect(tmpResult).to.be.an('object');
						Expect(tmpResult.entity).to.equal('Artifact');
						Expect(tmpResult.id).to.equal('42');
						Expect(tmpResult.version).to.equal('3');
					}
				);

				test
				(
					'Should parse absolute URLs.',
					function ()
					{
						let tmpFixture = createBinaryInterceptorFixture();

						let tmpResult = tmpFixture.interceptor._parseBinaryURL('http://localhost:8086/1.0/Artifact/Media/99/1');
						Expect(tmpResult).to.be.an('object');
						Expect(tmpResult.entity).to.equal('Artifact');
						Expect(tmpResult.id).to.equal('99');
						Expect(tmpResult.version).to.equal('1');
					}
				);

				test
				(
					'Should default to version 1 when no version segment.',
					function ()
					{
						let tmpFixture = createBinaryInterceptorFixture();

						let tmpResult = tmpFixture.interceptor._parseBinaryURL('/1.0/Artifact/Media/55');
						Expect(tmpResult).to.be.an('object');
						Expect(tmpResult.id).to.equal('55');
						Expect(tmpResult.version).to.equal('1');
					}
				);

				test
				(
					'Should return null for non-matching URLs.',
					function ()
					{
						let tmpFixture = createBinaryInterceptorFixture();

						let tmpResult = tmpFixture.interceptor._parseBinaryURL('/1.0/Book/42');
						Expect(tmpResult).to.equal(null);
					}
				);
			}
		);

		// ==================================================================
		// _isBinaryURL
		// ==================================================================
		suite
		(
			'_isBinaryURL',
			function ()
			{
				test
				(
					'Should identify Artifact/Media URLs as binary.',
					function ()
					{
						let tmpFixture = createBinaryInterceptorFixture();

						Expect(tmpFixture.interceptor._isBinaryURL('/1.0/Artifact/Media/42/1')).to.equal(true);
						Expect(tmpFixture.interceptor._isBinaryURL('http://localhost/1.0/Artifact/Media/42/1')).to.equal(true);
						Expect(tmpFixture.interceptor._isBinaryURL('/1.0/Artifact/5')).to.equal(false);
						Expect(tmpFixture.interceptor._isBinaryURL('/1.0/Book/42')).to.equal(false);
					}
				);
			}
		);

		// ==================================================================
		// connectBinary / disconnectBinary
		// ==================================================================
		suite
		(
			'connectBinary and disconnectBinary',
			function ()
			{
				test
				(
					'connectBinary should store BlobStore and DirtyTracker references.',
					function ()
					{
						let tmpFixture = createBinaryInterceptorFixture();

						Expect(tmpFixture.interceptor._BlobStore).to.equal(null);
						Expect(tmpFixture.interceptor._DirtyTracker).to.equal(null);

						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						Expect(tmpFixture.interceptor._BlobStore).to.equal(tmpFixture.blobStore);
						Expect(tmpFixture.interceptor._DirtyTracker).to.equal(tmpFixture.dirtyTracker);
					}
				);

				test
				(
					'disconnectBinary should clear references and return true.',
					function ()
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);
						let tmpResult = tmpFixture.interceptor.disconnectBinary();

						Expect(tmpResult).to.equal(true);
						Expect(tmpFixture.interceptor._BlobStore).to.equal(null);
						Expect(tmpFixture.interceptor._DirtyTracker).to.equal(null);
					}
				);

				test
				(
					'disconnectBinary should return false when not connected.',
					function ()
					{
						let tmpFixture = createBinaryInterceptorFixture();
						Expect(tmpFixture.interceptor.disconnectBinary()).to.equal(false);
					}
				);
			}
		);

		// ==================================================================
		// executeBinaryUpload interception
		// ==================================================================
		suite
		(
			'executeBinaryUpload interception',
			function ()
			{
				test
				(
					'Should route to BlobStore when URL matches and BlobStore is connected.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						let tmpOptions =
						{
							url: '/1.0/Artifact/Media/42/1',
							method: 'POST',
							body: Buffer.from('test binary data'),
							headers: { 'Content-Type': 'image/jpeg' }
						};

						tmpFixture.mockRestClient.executeBinaryUpload(tmpOptions,
							(pError, pResponse, pBody) =>
							{
								Expect(pError).to.not.exist;
								Expect(pResponse.statusCode).to.equal(200);

								// Original was NOT called
								Expect(tmpFixture.originalCalls.binaryUpload).to.equal(0);

								// Blob was stored
								let tmpStored = tmpFixture.blobStore._storage['Artifact:42:v1'];
								Expect(tmpStored).to.be.an('object');
								Expect(tmpStored.metadata.mimeType).to.equal('image/jpeg');
								Expect(tmpStored.metadata.entityID).to.equal('42');
								Expect(tmpStored.metadata.version).to.equal('1');

								// DirtyTracker recorded binary mutation
								Expect(tmpFixture.dirtyTracker.hasBinaryMutations()).to.equal(true);
								let tmpMutations = tmpFixture.dirtyTracker.getBinaryMutations();
								Expect(tmpMutations).to.have.length(1);
								Expect(tmpMutations[0].entity).to.equal('Artifact');
								Expect(tmpMutations[0].blobKey).to.equal('Artifact:42:v1');
								Expect(tmpMutations[0].mimeType).to.equal('image/jpeg');

								tmpFixture.interceptor.disconnect();
								fDone();
							});
					}
				);

				test
				(
					'Should call progress callback with 1.0 on BlobStore completion.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						let tmpProgressValue = -1;
						let tmpOptions =
						{
							url: '/1.0/Artifact/Media/10/1',
							method: 'POST',
							body: Buffer.from('progress test'),
							headers: { 'Content-Type': 'application/octet-stream' }
						};

						tmpFixture.mockRestClient.executeBinaryUpload(tmpOptions,
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpProgressValue).to.equal(1.0);
								tmpFixture.interceptor.disconnect();
								fDone();
							},
							(pProgress) =>
							{
								tmpProgressValue = pProgress;
							});
					}
				);

				test
				(
					'Should pass through to original when URL does not match.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						let tmpOptions =
						{
							url: '/api/some-other-upload',
							method: 'POST',
							body: Buffer.from('other data'),
							headers: { 'Content-Type': 'application/octet-stream' }
						};

						tmpFixture.mockRestClient.executeBinaryUpload(tmpOptions,
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpFixture.originalCalls.binaryUpload).to.equal(1);
								Expect(Object.keys(tmpFixture.blobStore._storage)).to.have.length(0);
								tmpFixture.interceptor.disconnect();
								fDone();
							});
					}
				);

				test
				(
					'Should pass through when BlobStore is not connected.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						// Intentionally NOT calling connectBinary

						let tmpOptions =
						{
							url: '/1.0/Artifact/Media/42/1',
							method: 'POST',
							body: Buffer.from('no blob store'),
							headers: { 'Content-Type': 'image/png' }
						};

						tmpFixture.mockRestClient.executeBinaryUpload(tmpOptions,
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpFixture.originalCalls.binaryUpload).to.equal(1);
								tmpFixture.interceptor.disconnect();
								fDone();
							});
					}
				);
			}
		);

		// ==================================================================
		// executeChunkedRequest binary download interception
		// ==================================================================
		suite
		(
			'executeChunkedRequest binary download',
			function ()
			{
				test
				(
					'Should route binary download URLs to BlobStore.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						// Pre-populate BlobStore
						let tmpTestData = Buffer.from('downloaded binary content');
						tmpFixture.blobStore.storeBlob('Artifact:42:v1', tmpTestData,
							{ mimeType: 'image/png' },
							(pStoreError) =>
							{
								Expect(pStoreError).to.not.exist;

								tmpFixture.mockRestClient.executeChunkedRequest(
									{ url: '/1.0/Artifact/Media/42/1', method: 'GET' },
									(pError, pResponse, pBody) =>
									{
										Expect(pError).to.not.exist;
										Expect(pResponse.statusCode).to.equal(200);
										Expect(pBody).to.deep.equal(tmpTestData);
										Expect(tmpFixture.originalCalls.chunked).to.equal(0);
										tmpFixture.interceptor.disconnect();
										fDone();
									});
							});
					}
				);

				test
				(
					'Should route entity URLs to IPC, not BlobStore.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						// /1.0/Artifact/5 is an entity URL, not a binary URL
						tmpFixture.mockRestClient.executeChunkedRequest(
							{ url: '/1.0/Artifact/5', method: 'GET' },
							(pError, pResponse, pBody) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpFixture.originalCalls.chunked).to.equal(0);
								Expect(pBody).to.equal('{"ipc":true}');
								tmpFixture.interceptor.disconnect();
								fDone();
							});
					}
				);

				test
				(
					'Should return error for missing blob.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						tmpFixture.mockRestClient.executeChunkedRequest(
							{ url: '/1.0/Artifact/Media/999/1', method: 'GET' },
							(pError) =>
							{
								Expect(pError).to.be.an('error');
								Expect(pError.message).to.contain('Blob not found');
								tmpFixture.interceptor.disconnect();
								fDone();
							});
					}
				);
			}
		);

		// ==================================================================
		// connectAdditionalRestClient binary wrapping
		// ==================================================================
		suite
		(
			'connectAdditionalRestClient binary wrapping',
			function ()
			{
				test
				(
					'Should wrap executeBinaryUpload on additional RestClient.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						let tmpAdditionalOriginalCalled = false;
						let tmpAdditionalRestClient =
						{
							preRequest: (pOptions) => pOptions,
							executeJSONRequest: (pOptions, fCallback) =>
							{
								fCallback(null, { statusCode: 200 }, {});
							},
							executeChunkedRequest: (pOptions, fCallback) =>
							{
								fCallback(null, { statusCode: 200 }, '');
							},
							executeBinaryUpload: (pOptions, fCallback, fOnProgress) =>
							{
								tmpAdditionalOriginalCalled = true;
								fCallback(null, { statusCode: 200 }, '{}');
							}
						};

						tmpFixture.interceptor.connectAdditionalRestClient(tmpAdditionalRestClient);

						let tmpOptions =
						{
							url: '/1.0/Artifact/Media/77/2',
							method: 'POST',
							body: Buffer.from('additional client binary'),
							headers: { 'Content-Type': 'image/gif' }
						};

						tmpAdditionalRestClient.executeBinaryUpload(tmpOptions,
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpAdditionalOriginalCalled).to.equal(false);

								let tmpStored = tmpFixture.blobStore._storage['Artifact:77:v2'];
								Expect(tmpStored).to.be.an('object');
								Expect(tmpStored.metadata.mimeType).to.equal('image/gif');

								// Non-matching URL should pass through
								tmpAdditionalRestClient.executeBinaryUpload(
									{ url: '/api/other', method: 'POST', body: Buffer.from('x'), headers: {} },
									(pOtherError) =>
									{
										Expect(pOtherError).to.not.exist;
										Expect(tmpAdditionalOriginalCalled).to.equal(true);
										tmpFixture.interceptor.disconnect();
										fDone();
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// disconnect restores all methods
		// ==================================================================
		suite
		(
			'disconnect restores binary methods',
			function ()
			{
				test
				(
					'Should restore executeBinaryUpload on primary and additional RestClients.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						let tmpAdditionalOriginalCalled = false;
						let tmpAdditionalRestClient =
						{
							preRequest: (pOptions) => pOptions,
							executeJSONRequest: (pOptions, fCallback) =>
							{
								fCallback(null, { statusCode: 200 }, {});
							},
							executeChunkedRequest: (pOptions, fCallback) =>
							{
								fCallback(null, { statusCode: 200 }, '');
							},
							executeBinaryUpload: (pOptions, fCallback) =>
							{
								tmpAdditionalOriginalCalled = true;
								fCallback(null, { statusCode: 200 }, '{}');
							}
						};

						tmpFixture.interceptor.connectAdditionalRestClient(tmpAdditionalRestClient);
						tmpFixture.interceptor.disconnect();

						let tmpOptions =
						{
							url: '/1.0/Artifact/Media/42/1',
							method: 'POST',
							body: Buffer.from('after disconnect'),
							headers: { 'Content-Type': 'image/png' }
						};

						// Primary should call original
						tmpFixture.mockRestClient.executeBinaryUpload(tmpOptions,
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpFixture.originalCalls.binaryUpload).to.equal(1);

								// Additional should also call original
								tmpAdditionalRestClient.executeBinaryUpload(tmpOptions,
									(pAdditionalError) =>
									{
										Expect(pAdditionalError).to.not.exist;
										Expect(tmpAdditionalOriginalCalled).to.equal(true);
										fDone();
									});
							});
					}
				);

				test
				(
					'disconnect should also clear BlobStore references.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						Expect(tmpFixture.interceptor._BlobStore).to.not.equal(null);

						tmpFixture.interceptor.disconnect();

						Expect(tmpFixture.interceptor._BlobStore).to.equal(null);
						Expect(tmpFixture.interceptor._DirtyTracker).to.equal(null);
						fDone();
					}
				);
			}
		);

		// ==================================================================
		// Round-trip: upload then download through interceptor
		// ==================================================================
		suite
		(
			'binary round-trip',
			function ()
			{
				test
				(
					'Upload via executeBinaryUpload then download via executeChunkedRequest.',
					function (fDone)
					{
						let tmpFixture = createBinaryInterceptorFixture();

						tmpFixture.interceptor.registerPrefix('/1.0/Artifact');
						tmpFixture.interceptor.connect(tmpFixture.mockRestClient, tmpFixture.mockIPCManager);
						tmpFixture.interceptor.connectBinary(tmpFixture.blobStore, tmpFixture.dirtyTracker);

						let tmpPayload = Buffer.from([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
						let tmpUploadOptions =
						{
							url: '/1.0/Artifact/Media/200/1',
							method: 'POST',
							body: tmpPayload,
							headers: { 'Content-Type': 'application/octet-stream' }
						};

						// Upload
						tmpFixture.mockRestClient.executeBinaryUpload(tmpUploadOptions,
							(pUploadError) =>
							{
								Expect(pUploadError).to.not.exist;

								// Download
								tmpFixture.mockRestClient.executeChunkedRequest(
									{ url: '/1.0/Artifact/Media/200/1', method: 'GET' },
									(pDownloadError, pResponse, pBody) =>
									{
										Expect(pDownloadError).to.not.exist;
										Expect(pResponse.statusCode).to.equal(200);
										Expect(pBody).to.deep.equal(tmpPayload);
										Expect(tmpFixture.originalCalls.binaryUpload).to.equal(0);
										Expect(tmpFixture.originalCalls.chunked).to.equal(0);
										tmpFixture.interceptor.disconnect();
										fDone();
									});
							});
					}
				);
			}
		);
	}
);
