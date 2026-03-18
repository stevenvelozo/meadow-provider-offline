/**
 * Batch Entity Registration Tests
 *
 * Tests addEntities() for registering multiple entities in a single call.
 *
 * @license MIT
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');

const libMeadowProviderOffline = require('../source/Meadow-Provider-Offline.js');

const _FableConfig =
{
	'Product': 'BatchRegisterTest',
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
		{ 'Column': 'Title',           'Type': 'String' }
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
		'Title': 'Unknown'
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

const _AuthorSchema =
{
	'Scope': 'Author',
	'DefaultIdentifier': 'IDAuthor',
	'Schema':
	[
		{ 'Column': 'IDAuthor',        'Type': 'AutoIdentity' },
		{ 'Column': 'GUIDAuthor',      'Type': 'AutoGUID' },
		{ 'Column': 'CreateDate',      'Type': 'CreateDate' },
		{ 'Column': 'CreatingIDUser',  'Type': 'CreateIDUser' },
		{ 'Column': 'UpdateDate',      'Type': 'UpdateDate' },
		{ 'Column': 'UpdatingIDUser',  'Type': 'UpdateIDUser' },
		{ 'Column': 'Deleted',         'Type': 'Deleted' },
		{ 'Column': 'DeletingIDUser',  'Type': 'DeleteIDUser' },
		{ 'Column': 'DeleteDate',      'Type': 'DeleteDate' },
		{ 'Column': 'Name',            'Type': 'String' }
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
		'type': 'object',
		'properties':
		{
			'IDAuthor': { 'type': 'integer' },
			'Name': { 'type': 'string' }
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
			'Update': 'Allow',
			'Delete': 'Allow',
			'Count': 'Allow',
			'Schema': 'Allow',
			'Validate': 'Allow',
			'New': 'Allow'
		}
	}
};

/**
 * Helper to invoke an IPC route with setImmediate wrapper.
 */
function invokeIPC(pProvider, pMethod, pRoute, pBody, fCallback)
{
	if (pBody)
	{
		pProvider.ipcOratorManager.stageBodyData(pBody);
	}

	pProvider.ipcOratorManager.orator.serviceServer.invoke(
		pMethod, pRoute, null,
		(pError, pResponseData) =>
		{
			setImmediate(() =>
			{
				if (pError)
				{
					return fCallback(pError);
				}
				let tmpParsed = pResponseData;
				if (typeof pResponseData === 'string')
				{
					try { tmpParsed = JSON.parse(pResponseData); }
					catch (e) { /* leave as string */ }
				}
				return fCallback(null, tmpParsed);
			});
		});
}

const _SessionConfig =
{
	SessionDataSource: 'None',
	DefaultSessionObject:
	{
		CustomerID: 1,
		SessionID: 'batch-test',
		DeviceID: 'TestRunner',
		UserID: 1,
		UserRole: 'Administrator',
		UserRoleIndex: 255,
		LoggedIn: true
	}
};


suite
(
	'Batch Entity Registration',
	function ()
	{
		this.timeout(15000);

		test
		(
			'Should register multiple entities in one call',
			(fDone) =>
			{
				let tmpFable = new libFable(_FableConfig);
				tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
				let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

				tmpProvider.initializeAsync(
					(pError) =>
					{
						Expect(pError).to.not.exist;

						tmpProvider.addEntities([_BookSchema, _AuthorSchema],
							(pBatchError) =>
							{
								Expect(pBatchError).to.not.exist;

								// Both entities should be registered
								Expect(tmpProvider.getEntity('Book')).to.exist;
								Expect(tmpProvider.getEntity('Author')).to.exist;
								Expect(tmpProvider.entityNames).to.include('Book');
								Expect(tmpProvider.entityNames).to.include('Author');

								fDone();
							});
					});
			}
		);

		test
		(
			'Should seed and read from batch-registered entities',
			(fDone) =>
			{
				let tmpFable = new libFable(_FableConfig);
				tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
				let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

				tmpProvider.initializeAsync(
					(pError) =>
					{
						Expect(pError).to.not.exist;

						tmpProvider.addEntities([_BookSchema, _AuthorSchema],
							(pBatchError) =>
							{
								Expect(pBatchError).to.not.exist;

								// Seed data into both entities
								tmpProvider.seedEntity('Book',
								[
									{ IDBook: 1, GUIDBook: 'b1', Title: 'Test Book', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
								]);
								tmpProvider.seedEntity('Author',
								[
									{ IDAuthor: 1, GUIDAuthor: 'a1', Name: 'Test Author', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
								]);

								// Read via IPC
								invokeIPC(tmpProvider, 'GET', '/1.0/Book/1', null,
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.Title).to.equal('Test Book');

										invokeIPC(tmpProvider, 'GET', '/1.0/Author/1', null,
											(pErr2, pData2) =>
											{
												Expect(pErr2).to.not.exist;
												Expect(pData2.Name).to.equal('Test Author');
												fDone();
											});
									});
							});
					});
			}
		);

		test
		(
			'Should skip already-registered entities',
			(fDone) =>
			{
				let tmpFable = new libFable(_FableConfig);
				tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
				let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

				tmpProvider.initializeAsync(
					(pError) =>
					{
						Expect(pError).to.not.exist;

						// Register Book first
						tmpProvider.addEntity(_BookSchema,
							() =>
							{
								// Batch register both — Book should be skipped
								tmpProvider.addEntities([_BookSchema, _AuthorSchema],
									(pBatchError) =>
									{
										Expect(pBatchError).to.not.exist;
										Expect(tmpProvider.entityNames).to.include('Book');
										Expect(tmpProvider.entityNames).to.include('Author');
										fDone();
									});
							});
					});
			}
		);

		test
		(
			'Should handle empty array gracefully',
			(fDone) =>
			{
				let tmpFable = new libFable(_FableConfig);
				tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
				let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

				tmpProvider.initializeAsync(
					(pError) =>
					{
						Expect(pError).to.not.exist;

						tmpProvider.addEntities([],
							(pBatchError) =>
							{
								Expect(pBatchError).to.not.exist;
								fDone();
							});
					});
			}
		);
	}
);
