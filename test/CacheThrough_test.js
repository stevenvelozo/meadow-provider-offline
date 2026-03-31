/**
 * Cache-Through Tests
 *
 * Tests the cache-through behavior: when an IPC read misses (record not
 * in local SQLite), the request falls through to the network, and the
 * successful network response is cached locally so subsequent reads
 * are served from SQLite.
 *
 * @license MIT
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');

const libMeadowProviderOffline = require('../source/Meadow-Provider-Offline.js');
const libRestClientInterceptor = require('../source/RestClient-Interceptor.js');
const libDataCacheManager = require('../source/Data-Cache-Manager.js');

const _FableConfig =
{
	'Product': 'CacheThroughTest',
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

const _BookSchema =
{
	'Scope': 'Book',
	'DefaultIdentifier': 'IDBook',
	'Schema':
	[
		{ 'Column': 'IDBook',          'Type': 'AutoIdentity' },
		{ 'Column': 'GUIDBook',        'Type': 'AutoGUID' },
		{ 'Column': 'CreateDate',      'Type': 'CreateDate' },
		{ 'Column': 'CreatingIDUser',  'Type': 'CreateIDUser' },
		{ 'Column': 'UpdateDate',      'Type': 'UpdateDate' },
		{ 'Column': 'UpdatingIDUser',  'Type': 'UpdateIDUser' },
		{ 'Column': 'Deleted',         'Type': 'Deleted' },
		{ 'Column': 'DeletingIDUser',  'Type': 'DeleteIDUser' },
		{ 'Column': 'DeleteDate',      'Type': 'DeleteDate' },
		{ 'Column': 'Title',           'Type': 'String' },
		{ 'Column': 'Description',     'Type': 'Text' }
	],
	'DefaultObject':
	{
		'IDBook': null,
		'GUIDBook': '',
		'CreateDate': false,
		'CreatingIDUser': 0,
		'UpdateDate': false,
		'UpdatingIDUser': 0,
		'Deleted': 0,
		'DeleteDate': false,
		'DeletingIDUser': 0,
		'Title': 'Unknown',
		'Description': ''
	},
	'JsonSchema':
	{
		'title': 'Book',
		'type': 'object',
		'properties':
		{
			'IDBook': { 'type': 'integer' },
			'Title': { 'type': 'string' }
		},
		'required': ['IDBook', 'Title']
	},
	'Authorization':
	{
		'Administrator':
		{
			'Create': 'Allow',
			'Read': 'Allow',
			'Reads': 'Allow',
			'Update': 'Allow',
			'Delete': 'Allow',
			'Count': 'Allow',
			'Schema': 'Allow',
			'Validate': 'Allow',
			'New': 'Allow'
		}
	}
};

// Schema with overlapping prefix to test longest-match
const _BookReviewSchema =
{
	'Scope': 'BookReview',
	'DefaultIdentifier': 'IDBookReview',
	'Schema':
	[
		{ 'Column': 'IDBookReview',     'Type': 'AutoIdentity' },
		{ 'Column': 'GUIDBookReview',   'Type': 'AutoGUID' },
		{ 'Column': 'CreateDate',       'Type': 'CreateDate' },
		{ 'Column': 'CreatingIDUser',   'Type': 'CreateIDUser' },
		{ 'Column': 'UpdateDate',       'Type': 'UpdateDate' },
		{ 'Column': 'UpdatingIDUser',   'Type': 'UpdateIDUser' },
		{ 'Column': 'Deleted',          'Type': 'Deleted' },
		{ 'Column': 'DeletingIDUser',   'Type': 'DeleteIDUser' },
		{ 'Column': 'DeleteDate',       'Type': 'DeleteDate' },
		{ 'Column': 'IDBook',           'Type': 'ForeignKey' },
		{ 'Column': 'Rating',           'Type': 'Integer' }
	],
	'DefaultObject':
	{
		'IDBookReview': null,
		'GUIDBookReview': '',
		'CreateDate': false,
		'CreatingIDUser': 0,
		'UpdateDate': false,
		'UpdatingIDUser': 0,
		'Deleted': 0,
		'DeleteDate': false,
		'DeletingIDUser': 0,
		'IDBook': 0,
		'Rating': 0
	},
	'JsonSchema':
	{
		'title': 'BookReview',
		'type': 'object',
		'properties':
		{
			'IDBookReview': { 'type': 'integer' },
			'Rating': { 'type': 'integer' }
		},
		'required': ['IDBookReview']
	},
	'Authorization':
	{
		'Administrator':
		{
			'Create': 'Allow',
			'Read': 'Allow',
			'Reads': 'Allow',
			'Update': 'Allow',
			'Delete': 'Allow',
			'Count': 'Allow',
			'Schema': 'Allow',
			'Validate': 'Allow',
			'New': 'Allow'
		}
	}
};

const _SessionConfig =
{
	SessionDataSource: 'None',
	DefaultSessionObject:
	{
		CustomerID: 1,
		SessionID: 'cache-through-test',
		DeviceID: 'TestRunner',
		UserID: 1,
		UserRole: 'Administrator',
		UserRoleIndex: 255,
		LoggedIn: true
	}
};


suite
(
	'Cache-Through',
	function ()
	{
		this.timeout(15000);

		// ==============================================================
		// getEntityForURL — longest-prefix matching
		// ==============================================================
		suite
		(
			'getEntityForURL — Longest-Prefix Matching',
			() =>
			{
				test
				(
					'Should return correct entity for exact prefix match',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
						let tmpInterceptor = tmpFable.serviceManager.instantiateServiceProvider('RestClientInterceptor');

						tmpInterceptor.registerPrefix('/1.0/Book', 'Book');

						Expect(tmpInterceptor.getEntityForURL('/1.0/Book/5')).to.equal('Book');
						Expect(tmpInterceptor.getEntityForURL('/1.0/Books/0/10')).to.equal('Book');
						Expect(tmpInterceptor.getEntityForURL('/1.0/Author/1')).to.equal(null);
						fDone();
					}
				);

				test
				(
					'Should resolve prefix collisions with longest-match (Book vs BookReview)',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
						let tmpInterceptor = tmpFable.serviceManager.instantiateServiceProvider('RestClientInterceptor');

						// Register in any order — longest match should win regardless
						tmpInterceptor.registerPrefix('/1.0/Book', 'Book');
						tmpInterceptor.registerPrefix('/1.0/BookReview', 'BookReview');

						Expect(tmpInterceptor.getEntityForURL('/1.0/Book/5')).to.equal('Book');
						Expect(tmpInterceptor.getEntityForURL('/1.0/Books/0/10')).to.equal('Book');
						Expect(tmpInterceptor.getEntityForURL('/1.0/BookReview/3')).to.equal('BookReview');
						Expect(tmpInterceptor.getEntityForURL('/1.0/BookReviews/0/10')).to.equal('BookReview');
						Expect(tmpInterceptor.getEntityForURL('/1.0/BookReview/Upsert')).to.equal('BookReview');
						fDone();
					}
				);

				test
				(
					'Should resolve collisions regardless of registration order',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
						let tmpInterceptor = tmpFable.serviceManager.instantiateServiceProvider('RestClientInterceptor');

						// Register longer prefix FIRST
						tmpInterceptor.registerPrefix('/1.0/BookReview', 'BookReview');
						tmpInterceptor.registerPrefix('/1.0/Book', 'Book');

						Expect(tmpInterceptor.getEntityForURL('/1.0/BookReview/3')).to.equal('BookReview');
						Expect(tmpInterceptor.getEntityForURL('/1.0/Book/5')).to.equal('Book');
						fDone();
					}
				);

				test
				(
					'Should handle absolute URLs',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
						let tmpInterceptor = tmpFable.serviceManager.instantiateServiceProvider('RestClientInterceptor');

						tmpInterceptor.registerPrefix('/1.0/Book', 'Book');

						Expect(tmpInterceptor.getEntityForURL('http://localhost:8086/1.0/Book/5')).to.equal('Book');
						fDone();
					}
				);

				test
				(
					'Should return null for prefixes without entity name',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
						let tmpInterceptor = tmpFable.serviceManager.instantiateServiceProvider('RestClientInterceptor');

						// Register without entity name (e.g., custom non-entity routes)
						tmpInterceptor.registerPrefix('/1.0/CheckSession');

						Expect(tmpInterceptor.getEntityForURL('/1.0/CheckSession')).to.equal(null);
						fDone();
					}
				);
			}
		);

		// ==============================================================
		// ingestRecords — Data-Cache-Manager
		// ==============================================================
		suite
		(
			'ingestRecords — INSERT OR IGNORE',
			() =>
			{
				test
				(
					'Should insert new records without clearing existing data',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DataCacheManager', libDataCacheManager);
						let tmpManager = tmpFable.serviceManager.instantiateServiceProvider('DataCacheManager');

						tmpManager.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpManager.createTable(_BookSchema,
									(pTableError) =>
									{
										Expect(pTableError).to.not.exist;

										// Seed initial data
										tmpManager.seedTable('Book',
										[
											{ IDBook: 1, GUIDBook: 'aaa', Title: 'Original', Description: '', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
										]);

										// Ingest a new record
										tmpManager.ingestRecords('Book',
										[
											{ IDBook: 2, GUIDBook: 'bbb', Title: 'Ingested', Description: '', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
										]);

										let tmpRows = tmpManager.db.prepare('SELECT * FROM Book ORDER BY IDBook').all();
										Expect(tmpRows).to.have.length(2);
										Expect(tmpRows[0].Title).to.equal('Original');
										Expect(tmpRows[1].Title).to.equal('Ingested');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should skip records that already exist (INSERT OR IGNORE)',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DataCacheManager', libDataCacheManager);
						let tmpManager = tmpFable.serviceManager.instantiateServiceProvider('DataCacheManager');

						tmpManager.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpManager.createTable(_BookSchema,
									(pTableError) =>
									{
										Expect(pTableError).to.not.exist;

										// Seed a record
										tmpManager.seedTable('Book',
										[
											{ IDBook: 1, GUIDBook: 'aaa', Title: 'Original', Description: 'Original desc', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
										]);

										// Try to ingest a record with the same ID but different data
										tmpManager.ingestRecords('Book',
										[
											{ IDBook: 1, GUIDBook: 'aaa', Title: 'Should Be Ignored', Description: 'New desc', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
										]);

										let tmpRows = tmpManager.db.prepare('SELECT * FROM Book').all();
										Expect(tmpRows).to.have.length(1);
										Expect(tmpRows[0].Title).to.equal('Original');
										Expect(tmpRows[0].Description).to.equal('Original desc');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should stringify object values for TEXT columns',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DataCacheManager', libDataCacheManager);
						let tmpManager = tmpFable.serviceManager.instantiateServiceProvider('DataCacheManager');

						tmpManager.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpManager.createTable(_BookSchema,
									(pTableError) =>
									{
										Expect(pTableError).to.not.exist;

										// Ingest with an object value (like meadow-endpoints returns for JSON)
										tmpManager.ingestRecords('Book',
										[
											{ IDBook: 1, GUIDBook: 'aaa', Title: 'JSON Test', Description: { nested: true }, CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
										]);

										let tmpRows = tmpManager.db.prepare('SELECT * FROM Book').all();
										Expect(tmpRows).to.have.length(1);
										Expect(tmpRows[0].Description).to.equal('{"nested":true}');
										fDone();
									});
							});
					}
				);
			}
		);

		// ==============================================================
		// Full Integration — Cache-Through via RestClient
		// ==============================================================
		suite
		(
			'Full Integration — Cache-Through',
			() =>
			{
				test
				(
					'Should cache a network fallback response and serve it on subsequent read',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;

										// Enable cache-through
										tmpProvider.enableCacheThrough();

										// DO NOT seed any data — the table is empty

										let tmpNetworkCallCount = 0;

										let tmpMockRestClient =
										{
											preRequest: (pOptions) => pOptions,
											executeJSONRequest: (pOptions, fCallback) =>
											{
												tmpNetworkCallCount++;
												// Simulate server returning a Book record
												fCallback(null, { statusCode: 200 },
													JSON.stringify({ IDBook: 42, GUIDBook: 'net-guid-42', Title: 'From Network', Description: 'Fetched from server', CreateDate: '2024-01-01', CreatingIDUser: 1, UpdateDate: '2024-01-01', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }));
											},
											executeChunkedRequest: (pOptions, fCallback) =>
											{
												fCallback(null, { statusCode: 200 }, '');
											}
										};

										tmpProvider.connect(tmpMockRestClient);

										// First request: should miss IPC, fall to network, cache the result
										tmpMockRestClient.executeJSONRequest(
											{ url: '/1.0/Book/42', method: 'GET' },
											(pErr, pResp, pBody) =>
											{
												Expect(pErr).to.not.exist;
												Expect(tmpNetworkCallCount).to.equal(1);

												let tmpResult = (typeof pBody === 'string') ? JSON.parse(pBody) : pBody;
												Expect(tmpResult.Title).to.equal('From Network');

												// Verify the record was cached in SQLite
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 42').all();
												Expect(tmpRows).to.have.length(1);
												Expect(tmpRows[0].Title).to.equal('From Network');

												// Second request: should be served from IPC (no network call)
												tmpMockRestClient.executeJSONRequest(
													{ url: '/1.0/Book/42', method: 'GET' },
													(pErr2, pResp2, pBody2) =>
													{
														Expect(pErr2).to.not.exist;
														// Network should NOT have been called again
														Expect(tmpNetworkCallCount).to.equal(1);

														let tmpResult2 = (typeof pBody2 === 'string') ? JSON.parse(pBody2) : pBody2;
														Expect(tmpResult2.Title).to.equal('From Network');

														tmpProvider.disconnect(tmpMockRestClient);
														fDone();
													});
											});
									});
							});
					}
				);

				test
				(
					'Should cache array responses from network fallback',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										// Directly invoke the cache ingest with an array to test
										// that multiple records are ingested correctly.
										// This simulates what happens when the network fallback
										// returns an array from a Reads/FilteredTo endpoint.
										let tmpInterceptor = tmpProvider.restClientInterceptor;
										let tmpWrapped = tmpInterceptor._wrapCallbackForCacheThrough(
											'GET', '/1.0/Books/0/10',
											(pErr, pResp, pBody) =>
											{
												Expect(pErr).to.not.exist;

												// Verify both records cached
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book ORDER BY IDBook').all();
												Expect(tmpRows).to.have.length(2);
												Expect(tmpRows[0].Title).to.equal('Book One');
												Expect(tmpRows[1].Title).to.equal('Book Two');
												fDone();
											});

										// Simulate a successful network response with an array
										tmpWrapped(null, { statusCode: 200 },
											JSON.stringify([
												{ IDBook: 1, GUIDBook: 'g1', Title: 'Book One', Description: '', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' },
												{ IDBook: 2, GUIDBook: 'g2', Title: 'Book Two', Description: '', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
											]));
									});
							});
					}
				);

				test
				(
					'Should NOT cache non-GET requests',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										let tmpMockRestClient =
										{
											preRequest: (pOptions) => pOptions,
											executeJSONRequest: (pOptions, fCallback) =>
											{
												fCallback(null, { statusCode: 200 },
													JSON.stringify({ IDBook: 99, GUIDBook: 'post-guid', Title: 'Posted', Description: '' }));
											},
											executeChunkedRequest: (pOptions, fCallback) =>
											{
												fCallback(null, { statusCode: 200 }, '');
											}
										};

										tmpProvider.connect(tmpMockRestClient);

										// POST request that falls to network — should NOT be cached
										tmpMockRestClient.executeJSONRequest(
											{ url: '/1.0/Book', method: 'POST', body: { Title: 'New' } },
											(pErr) =>
											{
												Expect(pErr).to.not.exist;

												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 99').all();
												Expect(tmpRows).to.have.length(0);

												tmpProvider.disconnect(tmpMockRestClient);
												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should NOT overwrite dirty records during cache-through',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										// Seed a record and create a dirty mutation for it
										tmpProvider.seedEntity('Book',
										[
											{ IDBook: 5, GUIDBook: 'dirty-guid', Title: 'Local Edit', Description: 'Modified locally', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
										]);
										tmpProvider.dirtyTracker.trackMutation('Book', 5, 'update',
											{ IDBook: 5, Title: 'Local Edit' });

										// Directly invoke the cache-through wrapper with a response
										// containing both dirty (ID 5) and clean (ID 6) records
										let tmpInterceptor = tmpProvider.restClientInterceptor;
										let tmpWrapped = tmpInterceptor._wrapCallbackForCacheThrough(
											'GET', '/1.0/Books/0/10',
											(pErr, pResp, pBody) =>
											{
												Expect(pErr).to.not.exist;

												// Dirty record (ID 5) should NOT be overwritten
												let tmpDirtyRow = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 5').all();
												Expect(tmpDirtyRow).to.have.length(1);
												Expect(tmpDirtyRow[0].Title).to.equal('Local Edit');

												// Clean record (ID 6) SHOULD be cached
												let tmpCleanRow = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 6').all();
												Expect(tmpCleanRow).to.have.length(1);
												Expect(tmpCleanRow[0].Title).to.equal('Clean Record');

												fDone();
											});

										tmpWrapped(null, { statusCode: 200 },
											JSON.stringify([
												{ IDBook: 5, GUIDBook: 'dirty-guid', Title: 'Server Version', Description: 'From server', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' },
												{ IDBook: 6, GUIDBook: 'clean-guid', Title: 'Clean Record', Description: 'Also from server', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
											]));
									});
							});
					}
				);

				test
				(
					'Should handle prefix collisions correctly during cache-through',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pBookError) =>
									{
										Expect(pBookError).to.not.exist;

										tmpProvider.addEntity(_BookReviewSchema,
											(pReviewError) =>
											{
												Expect(pReviewError).to.not.exist;
												tmpProvider.enableCacheThrough();

												// Verify entity lookup resolves correctly
												let tmpInterceptor = tmpProvider.restClientInterceptor;
												Expect(tmpInterceptor.getEntityForURL('/1.0/Book/5')).to.equal('Book');
												Expect(tmpInterceptor.getEntityForURL('/1.0/BookReview/3')).to.equal('BookReview');
												Expect(tmpInterceptor.getEntityForURL('/1.0/BookReviews/0/10')).to.equal('BookReview');

												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should disable cache-through when disableCacheThrough is called',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;

										tmpProvider.enableCacheThrough();
										tmpProvider.disableCacheThrough();

										let tmpMockRestClient =
										{
											preRequest: (pOptions) => pOptions,
											executeJSONRequest: (pOptions, fCallback) =>
											{
												fCallback(null, { statusCode: 200 },
													JSON.stringify({ IDBook: 77, GUIDBook: 'no-cache', Title: 'Should Not Cache', Description: '' }));
											},
											executeChunkedRequest: (pOptions, fCallback) =>
											{
												fCallback(null, { statusCode: 200 }, '');
											}
										};

										tmpProvider.connect(tmpMockRestClient);

										tmpMockRestClient.executeJSONRequest(
											{ url: '/1.0/Book/77', method: 'GET' },
											(pErr) =>
											{
												Expect(pErr).to.not.exist;

												// Should NOT be cached since cache-through is disabled
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 77').all();
												Expect(tmpRows).to.have.length(0);

												tmpProvider.disconnect(tmpMockRestClient);
												fDone();
											});
									});
							});
					}
				);
			}
		);

		// ==============================================================
		// Response Error Interceptor
		// ==============================================================
		suite
		(
			'Response Error Interceptor',
			() =>
			{
				test
				(
					'Should suppress caching when interceptor returns null',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										// Register an interceptor that suppresses error responses
										tmpProvider.restClientInterceptor.setResponseErrorInterceptor(
											(pEntityName, pResponse, pBody) =>
											{
												if (pBody && pBody.Error)
												{
													return null;
												}
												return pBody;
											});

										let tmpInterceptor = tmpProvider.restClientInterceptor;

										let tmpWrapped = tmpInterceptor._wrapCallbackForCacheThrough(
											'GET', '/1.0/Book/999',
											(pErr, pResp, pBody) =>
											{
												// Original callback should still fire with no error
												Expect(pErr).to.not.exist;

												// Record should NOT be cached
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 999').all();
												Expect(tmpRows).to.have.length(0);
												fDone();
											});

										// Simulate a 200 response with error in body
										tmpWrapped(null, { statusCode: 200 },
											JSON.stringify({ Error: 'Record not found', ErrorCode: 1 }));
									});
							});
					}
				);

				test
				(
					'Should synthesize error when interceptor throws',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										// Register an interceptor that throws on error responses
										tmpProvider.restClientInterceptor.setResponseErrorInterceptor(
											(pEntityName, pResponse, pBody) =>
											{
												if (pBody && pBody.Error)
												{
													throw new Error(pBody.Error);
												}
												return pBody;
											});

										let tmpInterceptor = tmpProvider.restClientInterceptor;

										let tmpWrapped = tmpInterceptor._wrapCallbackForCacheThrough(
											'GET', '/1.0/Book/999',
											(pErr, pResp, pBody) =>
											{
												// Callback should receive the synthesized error
												Expect(pErr).to.be.an.instanceof(Error);
												Expect(pErr.message).to.equal('Record not found');

												// Record should NOT be cached
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 999').all();
												Expect(tmpRows).to.have.length(0);
												fDone();
											});

										// Simulate a 200 response with error in body
										tmpWrapped(null, { statusCode: 200 },
											JSON.stringify({ Error: 'Record not found', ErrorCode: 1 }));
									});
							});
					}
				);

				test
				(
					'Should allow caching when interceptor returns data unchanged',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										// Register a pass-through interceptor
										tmpProvider.restClientInterceptor.setResponseErrorInterceptor(
											(pEntityName, pResponse, pBody) =>
											{
												return pBody;
											});

										let tmpInterceptor = tmpProvider.restClientInterceptor;

										let tmpWrapped = tmpInterceptor._wrapCallbackForCacheThrough(
											'GET', '/1.0/Book/42',
											(pErr, pResp, pBody) =>
											{
												Expect(pErr).to.not.exist;

												// Record SHOULD be cached
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 42').all();
												Expect(tmpRows).to.have.length(1);
												Expect(tmpRows[0].Title).to.equal('Valid Book');
												fDone();
											});

										// Simulate a valid 200 response
										tmpWrapped(null, { statusCode: 200 },
											JSON.stringify({ IDBook: 42, GUIDBook: 'valid-guid', Title: 'Valid Book', Description: '', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }));
									});
							});
					}
				);

				test
				(
					'Should allow interceptor to transform response data',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										// Register an interceptor that unwraps an envelope format
										tmpProvider.restClientInterceptor.setResponseErrorInterceptor(
											(pEntityName, pResponse, pBody) =>
											{
												if (pBody && pBody.data)
												{
													return pBody.data;
												}
												return pBody;
											});

										let tmpInterceptor = tmpProvider.restClientInterceptor;

										let tmpWrapped = tmpInterceptor._wrapCallbackForCacheThrough(
											'GET', '/1.0/Book/50',
											(pErr, pResp, pBody) =>
											{
												Expect(pErr).to.not.exist;

												// The unwrapped record should be cached
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 50').all();
												Expect(tmpRows).to.have.length(1);
												Expect(tmpRows[0].Title).to.equal('Unwrapped');
												fDone();
											});

										// Simulate a response with envelope wrapper
										tmpWrapped(null, { statusCode: 200 },
											JSON.stringify({
												data: { IDBook: 50, GUIDBook: 'wrap-guid', Title: 'Unwrapped', Description: '', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
											}));
									});
							});
					}
				);

				test
				(
					'Should not invoke interceptor for non-2xx responses',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										let tmpInterceptorCalled = false;

										tmpProvider.restClientInterceptor.setResponseErrorInterceptor(
											(pEntityName, pResponse, pBody) =>
											{
												tmpInterceptorCalled = true;
												return pBody;
											});

										let tmpInterceptor = tmpProvider.restClientInterceptor;

										let tmpWrapped = tmpInterceptor._wrapCallbackForCacheThrough(
											'GET', '/1.0/Book/404',
											(pErr, pResp, pBody) =>
											{
												// Interceptor should NOT have been called for 404
												Expect(tmpInterceptorCalled).to.equal(false);

												// Nothing should be cached
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 404').all();
												Expect(tmpRows).to.have.length(0);
												fDone();
											});

										// Simulate a 404 response
										tmpWrapped(null, { statusCode: 404 },
											JSON.stringify({ Error: 'Not found' }));
									});
							});
					}
				);

				test
				(
					'Should not invoke interceptor when none is registered',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										tmpProvider.enableCacheThrough();

										// No interceptor registered — default behavior

										let tmpInterceptor = tmpProvider.restClientInterceptor;

										let tmpWrapped = tmpInterceptor._wrapCallbackForCacheThrough(
											'GET', '/1.0/Book/10',
											(pErr, pResp, pBody) =>
											{
												Expect(pErr).to.not.exist;

												// Should cache normally without interceptor
												let tmpRows = tmpProvider.dataCacheManager.db.prepare('SELECT * FROM Book WHERE IDBook = 10').all();
												Expect(tmpRows).to.have.length(1);
												Expect(tmpRows[0].Title).to.equal('No Interceptor');
												fDone();
											});

										tmpWrapped(null, { statusCode: 200 },
											JSON.stringify({ IDBook: 10, GUIDBook: 'no-int', Title: 'No Interceptor', Description: '', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }));
									});
							});
					}
				);

				test
				(
					'Should clear interceptor with setResponseErrorInterceptor(null)',
					function (fDone)
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
						let tmpInterceptor = tmpFable.serviceManager.instantiateServiceProvider('RestClientInterceptor');

						let tmpCalled = false;
						tmpInterceptor.setResponseErrorInterceptor(() => { tmpCalled = true; return null; });
						Expect(tmpInterceptor._responseErrorInterceptor).to.be.a('function');

						tmpInterceptor.setResponseErrorInterceptor(null);
						Expect(tmpInterceptor._responseErrorInterceptor).to.equal(null);

						fDone();
					}
				);
			}
		);
	}
);
