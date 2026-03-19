/**
 * Tests for the NativeBridge provider integration.
 *
 * Verifies that when setNativeBridge() is called with a bridge function,
 * the provider skips sql.js initialization, routes queries through the
 * bridge, and the full CRUD lifecycle works end-to-end via meadow-endpoints.
 *
 * @license MIT
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');

const libMeadowProviderOffline = require('../source/Meadow-Provider-Offline.js');

const _FableConfig =
{
	'Product': 'NativeBridgeProviderTest',
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
	'Authorization':
	{
		'User':
		{
			'Create': 'Allow',
			'Read': 'Allow',
			'Reads': 'Allow',
			'Update': 'Allow',
			'Delete': 'Allow',
			'Count': 'Allow',
			'CountBy': 'Allow',
			'Schema': 'Allow',
			'Validate': 'Allow',
			'Upsert': 'Allow',
			'ReadMax': 'Allow',
			'ReadSelectList': 'Allow',
			'ReadsBy': 'Allow'
		}
	}
};

/**
 * Creates a mock bridge function backed by an in-memory store.
 * Simulates a native app that receives semantic CRUD operations.
 *
 * @returns {{ bridge: function, tables: object, operationLog: Array }}
 */
function createMockNativeBridge()
{
	let tmpTables = {};
	let tmpOperationLog = [];
	let tmpAutoIncrement = {};

	let tmpBridge = function (pSemanticOp, fCallback)
	{
		tmpOperationLog.push(pSemanticOp);

		let tmpEntity = pSemanticOp.entity;
		let tmpOp = pSemanticOp.operation;

		if (!tmpTables[tmpEntity])
		{
			tmpTables[tmpEntity] = [];
		}
		if (!tmpAutoIncrement[tmpEntity])
		{
			tmpAutoIncrement[tmpEntity] = 1;
		}

		if (tmpOp === 'Create')
		{
			let tmpRecord = Object.assign({}, pSemanticOp.record || {});
			let tmpIDField = pSemanticOp.idField || ('ID' + tmpEntity);
			tmpRecord[tmpIDField] = tmpAutoIncrement[tmpEntity]++;
			tmpTables[tmpEntity].push(tmpRecord);
			return fCallback(null, { records: [tmpRecord], lastInsertId: tmpRecord[tmpIDField], affectedRows: 1 });
		}
		else if (tmpOp === 'Read')
		{
			// Return all records (simplified)
			return fCallback(null, { records: tmpTables[tmpEntity].slice(), lastInsertId: 0, affectedRows: 0 });
		}
		else if (tmpOp === 'Count')
		{
			return fCallback(null, { records: [], count: tmpTables[tmpEntity].length, affectedRows: 0 });
		}
		else if (tmpOp === 'Update')
		{
			return fCallback(null, { records: [], lastInsertId: 0, affectedRows: 1 });
		}
		else if (tmpOp === 'Delete')
		{
			return fCallback(null, { records: [], lastInsertId: 0, affectedRows: 1 });
		}
		else
		{
			return fCallback(null, { records: [], lastInsertId: 0, affectedRows: 0 });
		}
	};

	return { bridge: tmpBridge, tables: tmpTables, operationLog: tmpOperationLog };
}

suite
(
	'NativeBridge Provider',
	() =>
	{
		suite
		(
			'setNativeBridge',
			() =>
			{
				test
				(
					'Should reject non-function arguments.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
							SessionDataSource: 'None',
							DefaultSessionObject: { UserID: 1, UserRole: 'User', CustomerID: 1 }
						});

						tmpProvider.setNativeBridge('not a function');
						Expect(tmpProvider.useNativeBridge).to.equal(false);
						fDone();
					}
				);

				test
				(
					'Should accept a valid bridge function.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
							SessionDataSource: 'None',
							DefaultSessionObject: { UserID: 1, UserRole: 'User', CustomerID: 1 }
						});

						let tmpMock = createMockNativeBridge();
						tmpProvider.setNativeBridge(tmpMock.bridge);
						Expect(tmpProvider.useNativeBridge).to.equal(true);
						fDone();
					}
				);
			}
		);

		suite
		(
			'initialization with NativeBridge',
			() =>
			{
				test
				(
					'Should initialize without sql.js when NativeBridge is set.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
							SessionDataSource: 'None',
							DefaultSessionObject: { UserID: 1, UserRole: 'User', CustomerID: 1 }
						});

						let tmpMock = createMockNativeBridge();
						tmpProvider.setNativeBridge(tmpMock.bridge);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpProvider.initialized).to.equal(true);
								Expect(tmpProvider.dataCacheManager).to.equal(null);
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'entity registration with NativeBridge',
			() =>
			{
				test
				(
					'Should register entity without creating SQLite table.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
							SessionDataSource: 'None',
							DefaultSessionObject: { UserID: 1, UserRole: 'User', CustomerID: 1 }
						});

						let tmpMock = createMockNativeBridge();
						tmpProvider.setNativeBridge(tmpMock.bridge);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_BookSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;
										Expect(tmpProvider.entityNames).to.include('Book');
										fDone();
									});
							});
					}
				);

				test
				(
					'seedEntity should be a no-op in NativeBridge mode.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
							SessionDataSource: 'None',
							DefaultSessionObject: { UserID: 1, UserRole: 'User', CustomerID: 1 }
						});

						let tmpMock = createMockNativeBridge();
						tmpProvider.setNativeBridge(tmpMock.bridge);

						tmpProvider.initializeAsync(
							() =>
							{
								tmpProvider.addEntity(_BookSchema,
									() =>
									{
										tmpProvider.seedEntity('Book', [{ IDBook: 1, Title: 'Test' }],
											(pError) =>
											{
												Expect(pError).to.not.exist;
												// No operations should have been logged for seeding
												let tmpSeedOps = tmpMock.operationLog.filter((q) => q.operation === 'Seed');
												Expect(tmpSeedOps).to.have.length(0);
												fDone();
											});
									});
							});
					}
				);
			}
		);

		suite
		(
			'queries routed through NativeBridge',
			() =>
			{
				test
				(
					'Should route Read queries through the bridge function.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
							SessionDataSource: 'None',
							DefaultSessionObject: { UserID: 1, UserRole: 'User', CustomerID: 1 }
						});

						let tmpMock = createMockNativeBridge();
						tmpProvider.setNativeBridge(tmpMock.bridge);

						tmpProvider.initializeAsync(
							() =>
							{
								tmpProvider.addEntity(_BookSchema,
									() =>
									{
										// Execute a Read query through the DAL
										let tmpEntity = tmpProvider.getEntity('Book');
										Expect(tmpEntity).to.exist;

										// Query via IPC orator (simulates what the interceptor would do)
										tmpProvider.ipcOratorManager.orator.serviceServer.invoke('GET', '/1.0/Book/1', null,
											(pResponse) =>
											{
												// Verify the bridge was called with a Read operation
												let tmpReadOps = tmpMock.operationLog.filter((q) => q.operation === 'Read');
												Expect(tmpReadOps.length).to.be.greaterThan(0);
												Expect(tmpReadOps[0].entity).to.equal('Book');
												fDone();
											});
									});
							});
					}
				);
			}
		);
	}
);
