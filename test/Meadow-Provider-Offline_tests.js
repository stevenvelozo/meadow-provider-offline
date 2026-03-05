/**
 * Meadow-Provider-Offline Tests
 *
 * Tests the offline provider's sub-services and full CRUD lifecycle
 * through the RestClient interception pipeline.
 *
 * @license MIT
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');

const libMeadowProviderOffline = require('../source/Meadow-Provider-Offline.js');
const libDirtyRecordTracker = require('../source/Dirty-Record-Tracker.js');
const libDataCacheManager = require('../source/Data-Cache-Manager.js');
const libIPCOratorManager = require('../source/IPC-Orator-Manager.js');
const libRestClientInterceptor = require('../source/RestClient-Interceptor.js');

const _FableConfig =
{
	'Product': 'MeadowProviderOfflineTest',
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

// Meadow package schema for a Book entity (matches POC BookStore pattern)
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
		'description': 'A book entity.',
		'type': 'object',
		'properties':
		{
			'IDBook': { 'description': 'The unique identifier', 'type': 'integer' },
			'Title': { 'description': 'The book title', 'type': 'string' },
			'Description': { 'description': 'The book description', 'type': 'string' }
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
			'ReadsBy': 'Allow',
			'ReadMax': 'Allow',
			'ReadSelectList': 'Allow',
			'Update': 'Allow',
			'Delete': 'Allow',
			'Count': 'Allow',
			'CountBy': 'Allow',
			'Schema': 'Allow',
			'Validate': 'Allow',
			'New': 'Allow'
		}
	}
};

// Meadow package schema for an Author entity
const _AuthorSchema =
{
	'Scope': 'Author',
	'DefaultIdentifier': 'IDAuthor',
	'Schema':
	[
		{ 'Column': 'IDAuthor',         'Type': 'AutoIdentity' },
		{ 'Column': 'GUIDAuthor',       'Type': 'AutoGUID' },
		{ 'Column': 'CreateDate',       'Type': 'CreateDate' },
		{ 'Column': 'CreatingIDUser',   'Type': 'CreateIDUser' },
		{ 'Column': 'UpdateDate',       'Type': 'UpdateDate' },
		{ 'Column': 'UpdatingIDUser',   'Type': 'UpdateIDUser' },
		{ 'Column': 'Deleted',          'Type': 'Deleted' },
		{ 'Column': 'DeletingIDUser',   'Type': 'DeleteIDUser' },
		{ 'Column': 'DeleteDate',       'Type': 'DeleteDate' },
		{ 'Column': 'Name',             'Type': 'String' }
	],
	'DefaultObject':
	{
		'IDAuthor': null,
		'GUIDAuthor': '',
		'CreateDate': false,
		'CreatingIDUser': 0,
		'UpdateDate': false,
		'UpdatingIDUser': 0,
		'Deleted': 0,
		'DeleteDate': false,
		'DeletingIDUser': 0,
		'Name': 'Unknown'
	},
	'JsonSchema':
	{
		'title': 'Author',
		'description': 'An author entity.',
		'type': 'object',
		'properties':
		{
			'IDAuthor': { 'description': 'The unique identifier', 'type': 'integer' },
			'Name': { 'description': 'The author name', 'type': 'string' }
		},
		'required': ['IDAuthor', 'Name']
	},
	'Authorization':
	{
		'Administrator':
		{
			'Create': 'Allow',
			'Read': 'Allow',
			'Reads': 'Allow',
			'ReadsBy': 'Allow',
			'ReadMax': 'Allow',
			'ReadSelectList': 'Allow',
			'Update': 'Allow',
			'Delete': 'Allow',
			'Count': 'Allow',
			'CountBy': 'Allow',
			'Schema': 'Allow',
			'Validate': 'Allow',
			'New': 'Allow'
		}
	}
};

suite
(
	'Meadow-Provider-Offline',
	() =>
	{
		// ====================================================================
		// Dirty Record Tracker
		// ====================================================================
		suite
		(
			'Dirty-Record-Tracker',
			() =>
			{
				test('Should instantiate as a Fable service',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DirtyRecordTracker', libDirtyRecordTracker);
						let tmpTracker = tmpFable.serviceManager.instantiateServiceProvider('DirtyRecordTracker');

						Expect(tmpTracker).to.be.an('object');
						Expect(tmpTracker.serviceType).to.equal('DirtyRecordTracker');
						Expect(tmpTracker.hasDirtyRecords()).to.equal(false);
						Expect(tmpTracker.getDirtyCount()).to.equal(0);
						fDone();
					});

				test('Should track mutations',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DirtyRecordTracker', libDirtyRecordTracker);
						let tmpTracker = tmpFable.serviceManager.instantiateServiceProvider('DirtyRecordTracker');

						tmpTracker.trackMutation('Book', 1, 'create', { IDBook: 1, Title: 'Test' });
						Expect(tmpTracker.hasDirtyRecords()).to.equal(true);
						Expect(tmpTracker.getDirtyCount()).to.equal(1);

						let tmpMutations = tmpTracker.getDirtyMutations();
						Expect(tmpMutations).to.have.length(1);
						Expect(tmpMutations[0].entity).to.equal('Book');
						Expect(tmpMutations[0].operation).to.equal('create');
						Expect(tmpMutations[0].record.Title).to.equal('Test');
						fDone();
					});

				test('Should coalesce create + delete = no-op',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DirtyRecordTracker', libDirtyRecordTracker);
						let tmpTracker = tmpFable.serviceManager.instantiateServiceProvider('DirtyRecordTracker');

						tmpTracker.trackMutation('Book', 1, 'create', { IDBook: 1, Title: 'Test' });
						tmpTracker.trackMutation('Book', 1, 'delete', { IDBook: 1, Title: 'Test' });

						Expect(tmpTracker.hasDirtyRecords()).to.equal(false);
						Expect(tmpTracker.getDirtyCount()).to.equal(0);
						fDone();
					});

				test('Should coalesce create + update = create with latest data',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DirtyRecordTracker', libDirtyRecordTracker);
						let tmpTracker = tmpFable.serviceManager.instantiateServiceProvider('DirtyRecordTracker');

						tmpTracker.trackMutation('Book', 1, 'create', { IDBook: 1, Title: 'Original' });
						tmpTracker.trackMutation('Book', 1, 'update', { IDBook: 1, Title: 'Updated' });

						let tmpMutations = tmpTracker.getDirtyMutations();
						Expect(tmpMutations).to.have.length(1);
						Expect(tmpMutations[0].operation).to.equal('create');
						Expect(tmpMutations[0].record.Title).to.equal('Updated');
						fDone();
					});

				test('Should clear mutations by entity',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DirtyRecordTracker', libDirtyRecordTracker);
						let tmpTracker = tmpFable.serviceManager.instantiateServiceProvider('DirtyRecordTracker');

						tmpTracker.trackMutation('Book', 1, 'create', { IDBook: 1, Title: 'Test' });
						tmpTracker.trackMutation('Author', 1, 'create', { IDAuthor: 1, Name: 'Test' });
						Expect(tmpTracker.getDirtyCount()).to.equal(2);

						tmpTracker.clearEntity('Book');
						Expect(tmpTracker.getDirtyCount()).to.equal(1);
						Expect(tmpTracker.hasEntityDirtyRecords('Book')).to.equal(false);
						Expect(tmpTracker.hasEntityDirtyRecords('Author')).to.equal(true);
						fDone();
					});

				test('Should clear all mutations',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DirtyRecordTracker', libDirtyRecordTracker);
						let tmpTracker = tmpFable.serviceManager.instantiateServiceProvider('DirtyRecordTracker');

						tmpTracker.trackMutation('Book', 1, 'create', { IDBook: 1, Title: 'Test' });
						tmpTracker.trackMutation('Author', 1, 'create', { IDAuthor: 1, Name: 'Test' });

						tmpTracker.clearAll();
						Expect(tmpTracker.hasDirtyRecords()).to.equal(false);
						Expect(tmpTracker.getDirtyCount()).to.equal(0);
						fDone();
					});
			}
		);

		// ====================================================================
		// Data Cache Manager
		// ====================================================================
		suite
		(
			'Data-Cache-Manager',
			() =>
			{
				test('Should initialize SQLite connection',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DataCacheManager', libDataCacheManager);
						let tmpManager = tmpFable.serviceManager.instantiateServiceProvider('DataCacheManager');

						Expect(tmpManager).to.be.an('object');
						Expect(tmpManager.serviceType).to.equal('DataCacheManager');
						Expect(tmpManager.initialized).to.equal(false);

						tmpManager.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpManager.initialized).to.equal(true);
								Expect(tmpManager.db).to.be.an('object');
								fDone();
							});
					});

				test('Should convert package schema to table schema',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('DataCacheManager', libDataCacheManager);
						let tmpManager = tmpFable.serviceManager.instantiateServiceProvider('DataCacheManager');

						let tmpTableSchema = tmpManager.convertPackageSchemaToTableSchema(_BookSchema);

						Expect(tmpTableSchema.TableName).to.equal('Book');
						Expect(tmpTableSchema.Columns).to.be.an('array');
						Expect(tmpTableSchema.Columns[0].Column).to.equal('IDBook');
						Expect(tmpTableSchema.Columns[0].DataType).to.equal('ID');
						Expect(tmpTableSchema.Columns[1].Column).to.equal('GUIDBook');
						Expect(tmpTableSchema.Columns[1].DataType).to.equal('GUID');
						fDone();
					});

				test('Should create a table from package schema',
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

										// Verify table exists by querying it
										let tmpRows = tmpManager.db.prepare('SELECT * FROM Book').all();
										Expect(tmpRows).to.be.an('array');
										Expect(tmpRows).to.have.length(0);
										fDone();
									});
							});
					});

				test('Should seed a table with records',
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

										let tmpRecords =
										[
											{ IDBook: 1, GUIDBook: '11111111-1111-1111-1111-111111111111', Title: 'Moby Dick', Description: 'A whale tale', CreateDate: '2024-01-01', CreatingIDUser: 1, UpdateDate: '2024-01-01', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: null },
											{ IDBook: 2, GUIDBook: '22222222-2222-2222-2222-222222222222', Title: 'War and Peace', Description: 'A long read', CreateDate: '2024-01-01', CreatingIDUser: 1, UpdateDate: '2024-01-01', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: null },
											{ IDBook: 3, GUIDBook: '33333333-3333-3333-3333-333333333333', Title: 'The Great Gatsby', Description: 'Jazz age', CreateDate: '2024-01-01', CreatingIDUser: 1, UpdateDate: '2024-01-01', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: null }
										];

										tmpManager.seedTable('Book', tmpRecords);

										let tmpRows = tmpManager.db.prepare('SELECT * FROM Book').all();
										Expect(tmpRows).to.have.length(3);
										Expect(tmpRows[0].Title).to.equal('Moby Dick');
										Expect(tmpRows[2].Title).to.equal('The Great Gatsby');
										fDone();
									});
							});
					});

				test('Should drop and reset a table',
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

										// Seed some data
										tmpManager.seedTable('Book',
										[
											{ IDBook: 1, GUIDBook: '11111111-1111-1111-1111-111111111111', Title: 'Test', Description: '', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: null }
										]);

										// Reset the table
										tmpManager.resetTable(_BookSchema,
											(pResetError) =>
											{
												Expect(pResetError).to.not.exist;

												let tmpRows = tmpManager.db.prepare('SELECT * FROM Book').all();
												Expect(tmpRows).to.have.length(0);
												fDone();
											});
									});
							});
					});
			}
		);

		// ====================================================================
		// IPC Orator Manager
		// ====================================================================
		suite
		(
			'IPC-Orator-Manager',
			() =>
			{
				test('Should initialize Orator IPC',
					function(fDone)
					{
						this.timeout(5000);

						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('IPCOratorManager', libIPCOratorManager);
						let tmpManager = tmpFable.serviceManager.instantiateServiceProvider('IPCOratorManager');

						Expect(tmpManager).to.be.an('object');
						Expect(tmpManager.serviceType).to.equal('IPCOratorManager');
						Expect(tmpManager.started).to.equal(false);

						tmpManager.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpManager.started).to.equal(true);
								Expect(tmpManager.orator).to.be.an('object');
								Expect(tmpManager.serviceServer).to.be.an('object');
								fDone();
							});
					});

				test('Should guard against missing routes',
					function(fDone)
					{
						this.timeout(5000);

						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('IPCOratorManager', libIPCOratorManager);
						let tmpManager = tmpFable.serviceManager.instantiateServiceProvider('IPCOratorManager');

						tmpManager.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								// Invoke a non-existent route — should return an error
								tmpManager.orator.serviceServer.invoke('GET', '/nonexistent/route', null,
									(pInvokeError) =>
									{
										Expect(pInvokeError).to.exist;
										Expect(pInvokeError.message).to.contain('Route not found');
										fDone();
									});
							});
					});
			}
		);

		// ====================================================================
		// RestClient Interceptor
		// ====================================================================
		suite
		(
			'RestClient-Interceptor',
			() =>
			{
				test('Should instantiate and register prefixes',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('RestClientInterceptor', libRestClientInterceptor);
						let tmpInterceptor = tmpFable.serviceManager.instantiateServiceProvider('RestClientInterceptor');

						Expect(tmpInterceptor).to.be.an('object');
						Expect(tmpInterceptor.serviceType).to.equal('RestClientInterceptor');

						tmpInterceptor.registerPrefix('/1.0/Book');
						Expect(tmpInterceptor.shouldIntercept('/1.0/Book')).to.equal(true);
						// '/1.0/Books/0/10' starts with '/1.0/Book' — correctly intercepted
						// (meadow-endpoints uses the scope for both singular and plural routes)
						Expect(tmpInterceptor.shouldIntercept('/1.0/Books/0/10')).to.equal(true);
						Expect(tmpInterceptor.shouldIntercept('/1.0/Author')).to.equal(false);
						Expect(tmpInterceptor.shouldIntercept('http://localhost:8086/1.0/Book')).to.equal(true);

						tmpInterceptor.unregisterPrefix('/1.0/Book');
						Expect(tmpInterceptor.shouldIntercept('/1.0/Book')).to.equal(false);
						fDone();
					});
			}
		);

		// ====================================================================
		// Full Integration — MeadowProviderOffline
		// ====================================================================
		suite
		(
			'Full Integration',
			() =>
			{
				test('Should initialize the offline provider',
					function(fDone)
					{
						this.timeout(10000);

						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
						{
							SessionDataSource: 'None',
							DefaultSessionObject:
							{
								CustomerID: 1,
								SessionID: 'test',
								DeviceID: 'Test',
								UserID: 1,
								UserRole: 'Administrator',
								UserRoleIndex: 255,
								LoggedIn: true
							}
						});

						Expect(tmpProvider).to.be.an('object');
						Expect(tmpProvider.serviceType).to.equal('MeadowProviderOffline');
						Expect(tmpProvider.initialized).to.equal(false);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpProvider.initialized).to.equal(true);
								Expect(tmpProvider.dirtyTracker).to.be.an('object');
								Expect(tmpProvider.dataCacheManager).to.be.an('object');
								Expect(tmpProvider.ipcOratorManager).to.be.an('object');
								Expect(tmpProvider.restClientInterceptor).to.be.an('object');
								fDone();
							});
					});

				test('Should add entities and create tables',
					function(fDone)
					{
						this.timeout(10000);

						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
						{
							SessionDataSource: 'None',
							DefaultSessionObject:
							{
								CustomerID: 1,
								SessionID: 'test',
								DeviceID: 'Test',
								UserID: 1,
								UserRole: 'Administrator',
								UserRoleIndex: 255,
								LoggedIn: true
							}
						});

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pBookError) =>
									{
										Expect(pBookError).to.not.exist;

										tmpProvider.addEntity(_AuthorSchema,
											(pAuthorError) =>
											{
												Expect(pAuthorError).to.not.exist;

												Expect(tmpProvider.entityNames).to.have.length(2);
												Expect(tmpProvider.entityNames).to.include('Book');
												Expect(tmpProvider.entityNames).to.include('Author');

												let tmpBookEntity = tmpProvider.getEntity('Book');
												Expect(tmpBookEntity).to.be.an('object');
												Expect(tmpBookEntity.dal).to.be.an('object');
												Expect(tmpBookEntity.endpoints).to.be.an('object');
												fDone();
											});
									});
							});
					});

				test('Should seed data and read it through IPC CRUD',
					function(fDone)
					{
						this.timeout(10000);

						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
						{
							SessionDataSource: 'None',
							DefaultSessionObject:
							{
								CustomerID: 1,
								SessionID: 'test',
								DeviceID: 'Test',
								UserID: 1,
								UserRole: 'Administrator',
								UserRoleIndex: 255,
								LoggedIn: true
							}
						});

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pBookError) =>
									{
										Expect(pBookError).to.not.exist;

										// Seed test data
										let tmpRecords =
										[
											{ IDBook: 1, GUIDBook: '11111111-1111-1111-1111-111111111111', Title: 'Moby Dick', Description: 'A whale tale', CreateDate: '2024-01-01', CreatingIDUser: 1, UpdateDate: '2024-01-01', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' },
											{ IDBook: 2, GUIDBook: '22222222-2222-2222-2222-222222222222', Title: 'War and Peace', Description: 'A long read', CreateDate: '2024-01-01', CreatingIDUser: 1, UpdateDate: '2024-01-01', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
										];

										tmpProvider.seedEntity('Book', tmpRecords);

										// Read records through IPC Orator directly to verify
										tmpProvider.ipcOratorManager.orator.serviceServer.invoke(
											'GET', '/1.0/Books/0/10', null,
											(pInvokeError, pResponseData, pSynthesizedResponse) =>
											{
												Expect(pInvokeError).to.not.exist;

												let tmpParsedData = (typeof pResponseData === 'string')
													? JSON.parse(pResponseData)
													: pResponseData;

												Expect(tmpParsedData).to.be.an('array');
												Expect(tmpParsedData).to.have.length(2);
												Expect(tmpParsedData[0].Title).to.equal('Moby Dick');
												Expect(tmpParsedData[1].Title).to.equal('War and Peace');
												fDone();
											});
									});
							});
					});

				test('Should create a record through IPC and track the mutation',
					function(fDone)
					{
						this.timeout(10000);

						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
						{
							SessionDataSource: 'None',
							DefaultSessionObject:
							{
								CustomerID: 1,
								SessionID: 'test',
								DeviceID: 'Test',
								UserID: 1,
								UserRole: 'Administrator',
								UserRoleIndex: 255,
								LoggedIn: true
							}
						});

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pBookError) =>
									{
										Expect(pBookError).to.not.exist;

										// Stage body data and invoke Create
										let tmpNewBook = { Title: 'New Book', Description: 'A test book' };
										tmpProvider.ipcOratorManager.stageBodyData(tmpNewBook);

										tmpProvider.ipcOratorManager.orator.serviceServer.invoke(
											'POST', '/1.0/Book', null,
											(pInvokeError, pResponseData, pSynthesizedResponse) =>
											{
												Expect(pInvokeError).to.not.exist;

												let tmpParsedData = (typeof pResponseData === 'string')
													? JSON.parse(pResponseData)
													: pResponseData;

												Expect(tmpParsedData).to.be.an('object');
												Expect(tmpParsedData.IDBook).to.be.above(0);
												Expect(tmpParsedData.Title).to.equal('New Book');

												// Verify dirty tracking
												Expect(tmpProvider.dirtyTracker.hasDirtyRecords()).to.equal(true);
												let tmpMutations = tmpProvider.dirtyTracker.getDirtyMutations();
												Expect(tmpMutations).to.have.length(1);
												Expect(tmpMutations[0].entity).to.equal('Book');
												Expect(tmpMutations[0].operation).to.equal('create');
												fDone();
											});
									});
							});
					});

				test('Should connect and disconnect from RestClient',
					function(fDone)
					{
						this.timeout(10000);

						let tmpFable = new libFable(_FableConfig);

						// Create a mock RestClient
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
						{
							SessionDataSource: 'None',
							DefaultSessionObject:
							{
								CustomerID: 1,
								SessionID: 'test',
								DeviceID: 'Test',
								UserID: 1,
								UserRole: 'Administrator',
								UserRoleIndex: 255,
								LoggedIn: true
							}
						});

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pBookError) =>
									{
										Expect(pBookError).to.not.exist;

										// Create a simple mock RestClient
										let tmpOriginalCalled = false;
										let tmpMockRestClient = {
											preRequest: (pOptions) => pOptions,
											executeJSONRequest: (pOptions, fCallback) =>
											{
												tmpOriginalCalled = true;
												fCallback(null, { statusCode: 200 }, { mock: true });
											},
											executeChunkedRequest: (pOptions, fCallback) =>
											{
												tmpOriginalCalled = true;
												fCallback(null, { statusCode: 200 }, 'mock');
											}
										};

										// Connect
										tmpProvider.connect(tmpMockRestClient);

										// A matching URL should NOT call the original
										tmpMockRestClient.executeJSONRequest({ url: '/1.0/Books/0/10', method: 'GET' },
											(pGetError, pResponse, pBody) =>
											{
												Expect(pGetError).to.not.exist;
												Expect(tmpOriginalCalled).to.equal(false);
												Expect(pBody).to.be.an('array');

												// A non-matching URL SHOULD call the original
												tmpOriginalCalled = false;
												tmpMockRestClient.executeJSONRequest({ url: '/api/some-other-endpoint', method: 'GET' },
													(pOtherError, pOtherResponse, pOtherBody) =>
													{
														Expect(tmpOriginalCalled).to.equal(true);
														Expect(pOtherBody.mock).to.equal(true);

														// Disconnect
														let tmpDisconnected = tmpProvider.disconnect(tmpMockRestClient);
														Expect(tmpDisconnected).to.equal(true);

														// After disconnect, a matching URL should call original
														tmpOriginalCalled = false;
														tmpMockRestClient.executeJSONRequest({ url: '/1.0/Books/0/10', method: 'GET' },
															(pFinalError, pFinalResponse, pFinalBody) =>
															{
																Expect(tmpOriginalCalled).to.equal(true);
																fDone();
															});
													});
											});
									});
							});
					});

				test('Should remove entities',
					function(fDone)
					{
						this.timeout(10000);

						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
						{
							SessionDataSource: 'None',
							DefaultSessionObject:
							{
								CustomerID: 1,
								SessionID: 'test',
								DeviceID: 'Test',
								UserID: 1,
								UserRole: 'Administrator',
								UserRoleIndex: 255,
								LoggedIn: true
							}
						});

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pBookError) =>
									{
										Expect(pBookError).to.not.exist;
										Expect(tmpProvider.entityNames).to.have.length(1);

										tmpProvider.removeEntity('Book');
										Expect(tmpProvider.entityNames).to.have.length(0);
										Expect(tmpProvider.getEntity('Book')).to.not.exist;
										fDone();
									});
							});
					});
			}
		);
	}
);
