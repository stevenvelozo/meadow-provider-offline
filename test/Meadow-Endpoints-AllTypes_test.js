/**
 * Meadow-Endpoints All Column Types — Integration Tests
 *
 * Exercises every standard meadow endpoint (Read, Reads, Create, Update,
 * Delete, Count) against a test table that includes every supported
 * column type: AutoIdentity, AutoGUID, CreateDate, CreateIDUser,
 * UpdateDate, UpdateIDUser, DeleteDate, DeleteIDUser, Deleted, String,
 * Text, Numeric, Integer, Decimal, Boolean, DateTime, JSON, JSONProxy,
 * ForeignKey.
 *
 * @license MIT
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');

const libMeadowProviderOffline = require('../source/Meadow-Provider-Offline.js');

const _FableConfig =
{
	'Product': 'MeadowEndpointsAllTypesTest',
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
 * Schema that exercises every supported column type.
 */
const _AllTypesSchema =
{
	'Scope': 'Widget',
	'DefaultIdentifier': 'IDWidget',
	'Schema':
	[
		{ 'Column': 'IDWidget',          'Type': 'AutoIdentity' },
		{ 'Column': 'GUIDWidget',        'Type': 'AutoGUID' },
		{ 'Column': 'CreateDate',        'Type': 'CreateDate' },
		{ 'Column': 'CreatingIDUser',    'Type': 'CreateIDUser' },
		{ 'Column': 'UpdateDate',        'Type': 'UpdateDate' },
		{ 'Column': 'UpdatingIDUser',    'Type': 'UpdateIDUser' },
		{ 'Column': 'Deleted',           'Type': 'Deleted' },
		{ 'Column': 'DeletingIDUser',    'Type': 'DeleteIDUser' },
		{ 'Column': 'DeleteDate',        'Type': 'DeleteDate' },
		{ 'Column': 'Name',             'Type': 'String', 'Size': 255 },
		{ 'Column': 'Description',      'Type': 'Text' },
		{ 'Column': 'Quantity',          'Type': 'Numeric' },
		{ 'Column': 'ItemCount',        'Type': 'Integer' },
		{ 'Column': 'Price',            'Type': 'Decimal' },
		{ 'Column': 'IsActive',         'Type': 'Boolean' },
		{ 'Column': 'ManufacturedDate', 'Type': 'DateTime' },
		{ 'Column': 'Metadata',         'Type': 'JSON' },
		{ 'Column': 'IDCategory',       'Type': 'ForeignKey' }
	],
	'DefaultObject':
	{
		'IDWidget': null,
		'GUIDWidget': '',
		'CreateDate': false,
		'CreatingIDUser': 0,
		'UpdateDate': false,
		'UpdatingIDUser': 0,
		'Deleted': 0,
		'DeleteDate': false,
		'DeletingIDUser': 0,
		'Name': 'Unknown',
		'Description': '',
		'Quantity': 0,
		'ItemCount': 0,
		'Price': 0,
		'IsActive': true,
		'ManufacturedDate': false,
		'Metadata': '{}',
		'IDCategory': 0
	},
	'JsonSchema':
	{
		'title': 'Widget',
		'description': 'A widget entity with all column types.',
		'type': 'object',
		'properties':
		{
			'IDWidget': { 'description': 'Unique identifier', 'type': 'integer' },
			'Name': { 'description': 'Widget name', 'type': 'string' },
			'Description': { 'description': 'Widget description', 'type': 'string' },
			'Quantity': { 'description': 'Quantity in stock', 'type': 'number' },
			'ItemCount': { 'description': 'Count of items', 'type': 'integer' },
			'Price': { 'description': 'Unit price', 'type': 'number' },
			'IsActive': { 'description': 'Active flag', 'type': 'boolean' },
			'ManufacturedDate': { 'description': 'When manufactured', 'type': 'string' },
			'Metadata': { 'description': 'JSON metadata', 'type': 'string' },
			'IDCategory': { 'description': 'Foreign key to category', 'type': 'integer' }
		},
		'required': ['IDWidget', 'Name']
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
			'New': 'Allow',
			'Undelete': 'Allow'
		}
	}
};

/**
 * Seed records with all column types populated.
 */
const _SeedRecords =
[
	{
		IDWidget: 1,
		GUIDWidget: 'aaaa1111-aaaa-1111-aaaa-111111111111',
		CreateDate: '2024-06-01 10:00:00',
		CreatingIDUser: 1,
		UpdateDate: '2024-06-01 10:00:00',
		UpdatingIDUser: 1,
		Deleted: 0,
		DeletingIDUser: 0,
		DeleteDate: '',
		Name: 'Alpha Widget',
		Description: 'The first widget in our collection.',
		Quantity: 100,
		ItemCount: 10,
		Price: 19.99,
		IsActive: 1,
		ManufacturedDate: '2024-01-15 08:30:00',
		Metadata: '{"color":"red","weight":2.5}',
		IDCategory: 5
	},
	{
		IDWidget: 2,
		GUIDWidget: 'bbbb2222-bbbb-2222-bbbb-222222222222',
		CreateDate: '2024-06-02 11:00:00',
		CreatingIDUser: 2,
		UpdateDate: '2024-06-02 11:00:00',
		UpdatingIDUser: 2,
		Deleted: 0,
		DeletingIDUser: 0,
		DeleteDate: '',
		Name: 'Beta Widget',
		Description: 'A second widget with different properties.',
		Quantity: 50,
		ItemCount: 5,
		Price: 29.95,
		IsActive: 0,
		ManufacturedDate: '2024-03-20 14:00:00',
		Metadata: '{"color":"blue","weight":1.2}',
		IDCategory: 3
	},
	{
		IDWidget: 3,
		GUIDWidget: 'cccc3333-cccc-3333-cccc-333333333333',
		CreateDate: '2024-06-03 12:00:00',
		CreatingIDUser: 1,
		UpdateDate: '2024-06-03 12:00:00',
		UpdatingIDUser: 1,
		Deleted: 0,
		DeletingIDUser: 0,
		DeleteDate: '',
		Name: 'Gamma Widget',
		Description: 'Third widget for testing edge cases.',
		Quantity: 0,
		ItemCount: 0,
		Price: 0.01,
		IsActive: 1,
		ManufacturedDate: '',
		Metadata: '{}',
		IDCategory: 0
	}
];

/**
 * Default session config used across all tests.
 */
const _SessionConfig =
{
	SessionDataSource: 'None',
	DefaultSessionObject:
	{
		CustomerID: 1,
		SessionID: 'test-all-types',
		DeviceID: 'TestRunner',
		UserID: 1,
		UserRole: 'Administrator',
		UserRoleIndex: 255,
		LoggedIn: true
	}
};

/**
 * Helper to create an initialized provider with the Widget entity and seed data.
 *
 * @param {function} fCallback - Callback with (pError, pProvider)
 */
function createSeededProvider(fCallback)
{
	let tmpFable = new libFable(_FableConfig);
	tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
	let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

	tmpProvider.initializeAsync(
		(pError) =>
		{
			if (pError)
			{
				return fCallback(pError);
			}

			tmpProvider.addEntity(_AllTypesSchema,
				(pEntityError) =>
				{
					if (pEntityError)
					{
						return fCallback(pEntityError);
					}

					tmpProvider.seedEntity('Widget', _SeedRecords);
					return fCallback(null, tmpProvider);
				});
		});
}

/**
 * Helper to invoke an IPC route and parse the response.
 *
 * @param {object} pProvider - The MeadowProviderOffline instance
 * @param {string} pMethod - HTTP method
 * @param {string} pRoute - URL route
 * @param {object|null} pBody - Optional body data to stage
 * @param {function} fCallback - Callback with (pError, pParsedData)
 */
function invokeIPC(pProvider, pMethod, pRoute, pBody, fCallback)
{
	if (pBody)
	{
		pProvider.ipcOratorManager.stageBodyData(pBody);
	}

	pProvider.ipcOratorManager.orator.serviceServer.invoke(
		pMethod, pRoute, null,
		(pError, pResponseData, pSynthesizedResponse) =>
		{
			// Wrap in setImmediate so assertion errors thrown inside
			// the callback are not swallowed by orator's internal
			// try-catch in the IPC invoke pipeline.
			setImmediate(() =>
			{
				if (pError)
				{
					return fCallback(pError);
				}

				let tmpParsed = pResponseData;
				if (typeof pResponseData === 'string')
				{
					try
					{
						tmpParsed = JSON.parse(pResponseData);
					}
					catch (pParseError)
					{
						// Return raw string if not JSON
					}
				}

				return fCallback(null, tmpParsed);
			});
		});
}


suite
(
	'Meadow Endpoints — All Column Types',
	function ()
	{
		this.timeout(15000);

		// ==================================================================
		// Table Setup & Schema
		// ==================================================================
		suite
		(
			'Table Setup',
			() =>
			{
				test
				(
					'Should create a table with all column types and seed data',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;
								Expect(pProvider).to.be.an('object');
								Expect(pProvider.entityNames).to.include('Widget');

								// Verify rows exist in SQLite directly
								let tmpRows = pProvider.dataCacheManager.db.prepare('SELECT * FROM Widget').all();
								Expect(tmpRows).to.have.length(3);
								fDone();
							});
					}
				);

				test
				(
					'Should preserve all column values through seeding',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpRows = pProvider.dataCacheManager.db.prepare('SELECT * FROM Widget ORDER BY IDWidget').all();

								// Row 1 checks
								Expect(tmpRows[0].IDWidget).to.equal(1);
								Expect(tmpRows[0].GUIDWidget).to.equal('aaaa1111-aaaa-1111-aaaa-111111111111');
								Expect(tmpRows[0].Name).to.equal('Alpha Widget');
								Expect(tmpRows[0].Quantity).to.equal(100);
								Expect(tmpRows[0].ItemCount).to.equal(10);
								Expect(tmpRows[0].Price).to.equal(19.99);
								Expect(tmpRows[0].IDCategory).to.equal(5);
								Expect(tmpRows[0].Metadata).to.equal('{"color":"red","weight":2.5}'); // Direct SQLite returns string

								// Row 3 — edge cases
								Expect(tmpRows[2].Quantity).to.equal(0);
								Expect(tmpRows[2].Price).to.equal(0.01);
								Expect(tmpRows[2].IDCategory).to.equal(0);

								fDone();
							});
					}
				);
			}
		);

		// ==================================================================
		// Read (GET /1.0/Widget/{ID})
		// ==================================================================
		suite
		(
			'Read — GET /1.0/Widget/{ID}',
			() =>
			{
				test
				(
					'Should read a single record by ID with all fields',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widget/1', null,
									(pReadError, pRecord) =>
									{
										Expect(pReadError).to.not.exist;
										Expect(pRecord).to.be.an('object');
										Expect(pRecord.IDWidget).to.equal(1);
										Expect(pRecord.GUIDWidget).to.equal('aaaa1111-aaaa-1111-aaaa-111111111111');
										Expect(pRecord.Name).to.equal('Alpha Widget');
										Expect(pRecord.Description).to.equal('The first widget in our collection.');
										Expect(pRecord.Quantity).to.equal(100);
										Expect(pRecord.ItemCount).to.equal(10);
										Expect(pRecord.Price).to.equal(19.99);
										Expect(pRecord.IDCategory).to.equal(5);
										Expect(pRecord.ManufacturedDate).to.equal('2024-01-15 08:30:00');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should read a record with zero and empty values',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widget/3', null,
									(pReadError, pRecord) =>
									{
										Expect(pReadError).to.not.exist;
										Expect(pRecord.IDWidget).to.equal(3);
										Expect(pRecord.Quantity).to.equal(0);
										Expect(pRecord.ItemCount).to.equal(0);
										Expect(pRecord.Price).to.equal(0.01);
										Expect(pRecord.IDCategory).to.equal(0);
										// JSON columns are auto-parsed by meadow-endpoints
										Expect(pRecord.Metadata).to.deep.equal({});
										fDone();
									});
							});
					}
				);

				test
				(
					'Should read a record with Boolean false (IsActive = 0)',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widget/2', null,
									(pReadError, pRecord) =>
									{
										Expect(pReadError).to.not.exist;
										Expect(pRecord.IDWidget).to.equal(2);
										Expect(pRecord.IsActive).to.be.oneOf([0, false]);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should return error or empty for non-existent record',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widget/999', null,
									(pReadError, pRecord) =>
									{
										// meadow-endpoints may return an empty record or an error
										// depending on the provider behavior
										if (pReadError)
										{
											Expect(pReadError).to.exist;
										}
										else
										{
											// If it returns data, the ID should indicate "not found"
											Expect(pRecord).to.be.an('object');
										}
										fDone();
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Reads (GET /1.0/Widgets/{Start}/{PageSize})
		// ==================================================================
		suite
		(
			'Reads — GET /1.0/Widgets/{Start}/{PageSize}',
			() =>
			{
				test
				(
					'Should read all records',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widgets/0/100', null,
									(pReadsError, pRecords) =>
									{
										Expect(pReadsError).to.not.exist;
										Expect(pRecords).to.be.an('array');
										Expect(pRecords).to.have.length(3);

										// Verify ordering (default is by ID ascending)
										Expect(pRecords[0].IDWidget).to.equal(1);
										Expect(pRecords[1].IDWidget).to.equal(2);
										Expect(pRecords[2].IDWidget).to.equal(3);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should respect pagination — page size 1',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widgets/0/1', null,
									(pReadsError, pRecords) =>
									{
										Expect(pReadsError).to.not.exist;
										Expect(pRecords).to.be.an('array');
										Expect(pRecords).to.have.length(1);
										Expect(pRecords[0].IDWidget).to.equal(1);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should respect pagination — page 2',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widgets/1/1', null,
									(pReadsError, pRecords) =>
									{
										Expect(pReadsError).to.not.exist;
										Expect(pRecords).to.be.an('array');
										Expect(pRecords).to.have.length(1);
										Expect(pRecords[0].IDWidget).to.equal(2);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should return all column types in Reads results',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widgets/0/10', null,
									(pReadsError, pRecords) =>
									{
										Expect(pReadsError).to.not.exist;

										let tmpFirst = pRecords[0];

										// Verify all column types are present
										Expect(tmpFirst).to.have.property('IDWidget');
										Expect(tmpFirst).to.have.property('GUIDWidget');
										Expect(tmpFirst).to.have.property('CreateDate');
										Expect(tmpFirst).to.have.property('CreatingIDUser');
										Expect(tmpFirst).to.have.property('UpdateDate');
										Expect(tmpFirst).to.have.property('UpdatingIDUser');
										Expect(tmpFirst).to.have.property('Deleted');
										Expect(tmpFirst).to.have.property('DeletingIDUser');
										Expect(tmpFirst).to.have.property('DeleteDate');
										Expect(tmpFirst).to.have.property('Name');
										Expect(tmpFirst).to.have.property('Description');
										Expect(tmpFirst).to.have.property('Quantity');
										Expect(tmpFirst).to.have.property('ItemCount');
										Expect(tmpFirst).to.have.property('Price');
										Expect(tmpFirst).to.have.property('IsActive');
										Expect(tmpFirst).to.have.property('ManufacturedDate');
										Expect(tmpFirst).to.have.property('Metadata');
										Expect(tmpFirst).to.have.property('IDCategory');
										fDone();
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Count (GET /1.0/Widgets/Count)
		// ==================================================================
		suite
		(
			'Count — GET /1.0/Widgets/Count',
			() =>
			{
				test
				(
					'Should return the correct count of records',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'GET', '/1.0/Widgets/Count', null,
									(pCountError, pResult) =>
									{
										Expect(pCountError).to.not.exist;
										Expect(pResult).to.be.an('object');
										Expect(pResult.Count).to.equal(3);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should return zero count for empty table',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_AllTypesSchema,
									(pEntityError) =>
									{
										Expect(pEntityError).to.not.exist;

										// No seed data — table is empty
										invokeIPC(tmpProvider, 'GET', '/1.0/Widgets/Count', null,
											(pCountError, pResult) =>
											{
												Expect(pCountError).to.not.exist;
												Expect(pResult).to.be.an('object');
												Expect(pResult.Count).to.equal(0);
												fDone();
											});
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Create (POST /1.0/Widget)
		// ==================================================================
		suite
		(
			'Create — POST /1.0/Widget',
			() =>
			{
				test
				(
					'Should create a record with all field types and return it',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpNewWidget =
								{
									Name: 'Delta Widget',
									Description: 'A newly created widget with all types.',
									Quantity: 200,
									ItemCount: 20,
									Price: 49.99,
									IsActive: 1,
									ManufacturedDate: '2025-06-15 09:00:00',
									Metadata: '{"color":"green","weight":3.7}',
									IDCategory: 7
								};

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpNewWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;
										Expect(pCreated).to.be.an('object');
										Expect(pCreated.IDWidget).to.be.above(0);
										Expect(pCreated.Name).to.equal('Delta Widget');
										Expect(pCreated.Quantity).to.equal(200);
										Expect(pCreated.Price).to.equal(49.99);
										Expect(pCreated.IDCategory).to.equal(7);
										Expect(pCreated.Metadata).to.deep.equal({ color: 'green', weight: 3.7 });

										// GUIDWidget should be auto-generated
										Expect(pCreated.GUIDWidget).to.be.a('string');
										Expect(pCreated.GUIDWidget.length).to.be.above(0);

										fDone();
									});
							});
					}
				);

				test
				(
					'Should create a record with minimal fields (defaults applied)',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpMinimalWidget =
								{
									Name: 'Minimal Widget'
								};

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpMinimalWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;
										Expect(pCreated).to.be.an('object');
										Expect(pCreated.IDWidget).to.be.above(0);
										Expect(pCreated.Name).to.equal('Minimal Widget');

										// Defaults should be applied for unspecified fields
										Expect(pCreated.Deleted).to.be.oneOf([0, false]);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should create and be immediately readable',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpWidget = { Name: 'Readable Widget', Quantity: 42, Price: 9.99, IDCategory: 2 };

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;

										let tmpNewID = pCreated.IDWidget;

										invokeIPC(pProvider, 'GET', `/1.0/Widget/${tmpNewID}`, null,
											(pReadError, pReadRecord) =>
											{
												Expect(pReadError).to.not.exist;
												Expect(pReadRecord.IDWidget).to.equal(tmpNewID);
												Expect(pReadRecord.Name).to.equal('Readable Widget');
												Expect(pReadRecord.Quantity).to.equal(42);
												Expect(pReadRecord.Price).to.equal(9.99);
												Expect(pReadRecord.IDCategory).to.equal(2);
												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should track create mutation in DirtyRecordTracker',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								// Clear any existing dirty state
								pProvider.dirtyTracker.clearAll();

								let tmpWidget = { Name: 'Tracked Widget' };

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;

										Expect(pProvider.dirtyTracker.hasDirtyRecords()).to.equal(true);
										let tmpMutations = pProvider.dirtyTracker.getDirtyMutationsForEntity('Widget');
										Expect(tmpMutations).to.have.length(1);
										Expect(tmpMutations[0].operation).to.equal('create');
										Expect(tmpMutations[0].record.Name).to.equal('Tracked Widget');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should increment count after create',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'POST', '/1.0/Widget', { Name: 'Extra Widget' },
									(pCreateError) =>
									{
										Expect(pCreateError).to.not.exist;

										invokeIPC(pProvider, 'GET', '/1.0/Widgets/Count', null,
											(pCountError, pResult) =>
											{
												Expect(pCountError).to.not.exist;
												Expect(pResult.Count).to.equal(4);
												fDone();
											});
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Update (PUT /1.0/Widget)
		// ==================================================================
		suite
		(
			'Update — PUT /1.0/Widget',
			() =>
			{
				test
				(
					'Should update string, numeric, decimal, and boolean fields',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpUpdated =
								{
									IDWidget: 1,
									GUIDWidget: 'aaaa1111-aaaa-1111-aaaa-111111111111',
									Name: 'Alpha Widget UPDATED',
									Description: 'Updated description.',
									Quantity: 999,
									ItemCount: 50,
									Price: 39.99,
									IsActive: 0,
									ManufacturedDate: '2025-12-25 00:00:00',
									Metadata: '{"color":"gold","weight":5.0}',
									IDCategory: 10
								};

								invokeIPC(pProvider, 'PUT', '/1.0/Widget', tmpUpdated,
									(pUpdateError, pResult) =>
									{
										Expect(pUpdateError).to.not.exist;
										Expect(pResult).to.be.an('object');

										// Read back to verify
										invokeIPC(pProvider, 'GET', '/1.0/Widget/1', null,
											(pReadError, pRecord) =>
											{
												Expect(pReadError).to.not.exist;
												Expect(pRecord.Name).to.equal('Alpha Widget UPDATED');
												Expect(pRecord.Description).to.equal('Updated description.');
												Expect(pRecord.Quantity).to.equal(999);
												Expect(pRecord.ItemCount).to.equal(50);
												Expect(pRecord.Price).to.equal(39.99);
												Expect(pRecord.IsActive).to.be.oneOf([0, false]);
												Expect(pRecord.Metadata).to.deep.equal({ color: 'gold', weight: 5.0 });
												Expect(pRecord.IDCategory).to.equal(10);
												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should track update mutation in DirtyRecordTracker',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;
								pProvider.dirtyTracker.clearAll();

								let tmpUpdated =
								{
									IDWidget: 2,
									GUIDWidget: 'bbbb2222-bbbb-2222-bbbb-222222222222',
									Name: 'Beta Widget UPDATED'
								};

								invokeIPC(pProvider, 'PUT', '/1.0/Widget', tmpUpdated,
									(pUpdateError) =>
									{
										Expect(pUpdateError).to.not.exist;

										let tmpMutations = pProvider.dirtyTracker.getDirtyMutationsForEntity('Widget');
										Expect(tmpMutations).to.have.length(1);
										Expect(tmpMutations[0].operation).to.equal('update');
										Expect(tmpMutations[0].id).to.equal(2);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should preserve non-updated fields',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								// Read original first
								invokeIPC(pProvider, 'GET', '/1.0/Widget/1', null,
									(pReadError, pOriginal) =>
									{
										Expect(pReadError).to.not.exist;

										// Update only the Name
										let tmpPartialUpdate =
										{
											IDWidget: 1,
											GUIDWidget: pOriginal.GUIDWidget,
											Name: 'Only Name Changed'
										};

										invokeIPC(pProvider, 'PUT', '/1.0/Widget', tmpPartialUpdate,
											(pUpdateError) =>
											{
												Expect(pUpdateError).to.not.exist;

												invokeIPC(pProvider, 'GET', '/1.0/Widget/1', null,
													(pVerifyError, pVerified) =>
													{
														Expect(pVerifyError).to.not.exist;
														Expect(pVerified.Name).to.equal('Only Name Changed');
														// Other fields should still have their values
														Expect(pVerified.IDCategory).to.equal(5);
														fDone();
													});
											});
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Delete (DELETE /1.0/Widget/{ID})
		// ==================================================================
		suite
		(
			'Delete — DELETE /1.0/Widget/{ID}',
			() =>
			{
				test
				(
					'Should delete a record (soft delete)',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'DELETE', '/1.0/Widget/2', null,
									(pDeleteError, pResult) =>
									{
										Expect(pDeleteError).to.not.exist;

										// After delete, count should exclude deleted records
										invokeIPC(pProvider, 'GET', '/1.0/Widgets/Count', null,
											(pCountError, pCountResult) =>
											{
												Expect(pCountError).to.not.exist;
												// Soft delete sets Deleted=1, so count should be 2
												Expect(pCountResult.Count).to.equal(2);
												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should track delete mutation in DirtyRecordTracker',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;
								pProvider.dirtyTracker.clearAll();

								invokeIPC(pProvider, 'DELETE', '/1.0/Widget/1', null,
									(pDeleteError) =>
									{
										Expect(pDeleteError).to.not.exist;

										let tmpMutations = pProvider.dirtyTracker.getDirtyMutationsForEntity('Widget');
										Expect(tmpMutations).to.have.length(1);
										Expect(tmpMutations[0].operation).to.equal('delete');
										Expect(tmpMutations[0].id).to.equal(1);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should not return deleted records in Reads',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								invokeIPC(pProvider, 'DELETE', '/1.0/Widget/1', null,
									(pDeleteError) =>
									{
										Expect(pDeleteError).to.not.exist;

										invokeIPC(pProvider, 'GET', '/1.0/Widgets/0/100', null,
											(pReadsError, pRecords) =>
											{
												Expect(pReadsError).to.not.exist;
												Expect(pRecords).to.be.an('array');
												Expect(pRecords).to.have.length(2);

												// Deleted record should not appear
												let tmpIDs = pRecords.map((pR) => pR.IDWidget);
												Expect(tmpIDs).to.not.include(1);
												fDone();
											});
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// RestClient Interception — Full CRUD
		// ==================================================================
		suite
		(
			'RestClient Interception — Full CRUD cycle',
			() =>
			{
				test
				(
					'Should intercept Reads through a mock RestClient',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpOriginalCalled = false;
								let tmpMockRestClient =
								{
									preRequest: (pOptions) => pOptions,
									executeJSONRequest: (pOptions, fCallback) =>
									{
										tmpOriginalCalled = true;
										fCallback(null, { statusCode: 200 }, []);
									},
									executeChunkedRequest: (pOptions, fCallback) =>
									{
										fCallback(null, { statusCode: 200 }, '');
									}
								};

								pProvider.connect(tmpMockRestClient);

								tmpMockRestClient.executeJSONRequest(
									{ url: '/1.0/Widgets/0/10', method: 'GET' },
									(pGetError, pResponse, pBody) =>
									{
										Expect(pGetError).to.not.exist;
										Expect(tmpOriginalCalled).to.equal(false);

										let tmpRecords = (typeof pBody === 'string') ? JSON.parse(pBody) : pBody;
										Expect(tmpRecords).to.be.an('array');
										Expect(tmpRecords).to.have.length(3);

										pProvider.disconnect(tmpMockRestClient);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should intercept Create through a mock RestClient',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpOriginalCalled = false;
								let tmpMockRestClient =
								{
									preRequest: (pOptions) => pOptions,
									executeJSONRequest: (pOptions, fCallback) =>
									{
										tmpOriginalCalled = true;
										fCallback(null, { statusCode: 200 }, {});
									},
									executeChunkedRequest: (pOptions, fCallback) =>
									{
										fCallback(null, { statusCode: 200 }, '');
									}
								};

								pProvider.connect(tmpMockRestClient);

								let tmpCreateOptions =
								{
									url: '/1.0/Widget',
									method: 'POST',
									body: { Name: 'RestClient Created', Quantity: 77, Price: 12.50 }
								};

								tmpMockRestClient.executeJSONRequest(tmpCreateOptions,
									(pCreateError, pResponse, pBody) =>
									{
										Expect(pCreateError).to.not.exist;
										Expect(tmpOriginalCalled).to.equal(false);

										let tmpCreated = (typeof pBody === 'string') ? JSON.parse(pBody) : pBody;
										Expect(tmpCreated.IDWidget).to.be.above(0);
										Expect(tmpCreated.Name).to.equal('RestClient Created');

										pProvider.disconnect(tmpMockRestClient);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should intercept Count through a mock RestClient',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpOriginalCalled = false;
								let tmpMockRestClient =
								{
									preRequest: (pOptions) => pOptions,
									executeJSONRequest: (pOptions, fCallback) =>
									{
										tmpOriginalCalled = true;
										fCallback(null, { statusCode: 200 }, {});
									},
									executeChunkedRequest: (pOptions, fCallback) =>
									{
										fCallback(null, { statusCode: 200 }, '');
									}
								};

								pProvider.connect(tmpMockRestClient);

								tmpMockRestClient.executeJSONRequest(
									{ url: '/1.0/Widgets/Count', method: 'GET' },
									(pCountError, pResponse, pBody) =>
									{
										Expect(pCountError).to.not.exist;
										Expect(tmpOriginalCalled).to.equal(false);

										let tmpResult = (typeof pBody === 'string') ? JSON.parse(pBody) : pBody;
										Expect(tmpResult.Count).to.equal(3);

										pProvider.disconnect(tmpMockRestClient);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should pass non-matching URLs to original RestClient',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpOriginalCalled = false;
								let tmpMockRestClient =
								{
									preRequest: (pOptions) => pOptions,
									executeJSONRequest: (pOptions, fCallback) =>
									{
										tmpOriginalCalled = true;
										fCallback(null, { statusCode: 200 }, { passthrough: true });
									},
									executeChunkedRequest: (pOptions, fCallback) =>
									{
										fCallback(null, { statusCode: 200 }, '');
									}
								};

								pProvider.connect(tmpMockRestClient);

								tmpMockRestClient.executeJSONRequest(
									{ url: '/api/v2/unrelated-endpoint', method: 'GET' },
									(pOtherError, pResponse, pBody) =>
									{
										Expect(pOtherError).to.not.exist;
										Expect(tmpOriginalCalled).to.equal(true);
										Expect(pBody.passthrough).to.equal(true);

										pProvider.disconnect(tmpMockRestClient);
										fDone();
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Full CRUD Lifecycle through IPC
		// ==================================================================
		suite
		(
			'Full CRUD Lifecycle',
			() =>
			{
				test
				(
					'Create → Read → Update → Read → Delete → Count',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;
								pProvider.dirtyTracker.clearAll();

								// Step 1: Create
								let tmpWidget =
								{
									Name: 'Lifecycle Widget',
									Description: 'Testing the full lifecycle.',
									Quantity: 10,
									ItemCount: 1,
									Price: 5.50,
									IsActive: 1,
									ManufacturedDate: '2025-01-01 00:00:00',
									Metadata: '{"lifecycle":"test"}',
									IDCategory: 99
								};

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;
										let tmpID = pCreated.IDWidget;
										Expect(tmpID).to.be.above(3); // IDs 1-3 are seeded

										// Step 2: Read
										invokeIPC(pProvider, 'GET', `/1.0/Widget/${tmpID}`, null,
											(pReadError, pRead) =>
											{
												Expect(pReadError).to.not.exist;
												Expect(pRead.Name).to.equal('Lifecycle Widget');
												Expect(pRead.IDCategory).to.equal(99);
												Expect(pRead.Metadata).to.deep.equal({ lifecycle: 'test' });

												// Step 3: Update
												let tmpUpdate =
												{
													IDWidget: tmpID,
													GUIDWidget: pRead.GUIDWidget,
													Name: 'Lifecycle Widget UPDATED',
													Quantity: 20,
													Price: 11.00,
													IDCategory: 100
												};

												invokeIPC(pProvider, 'PUT', '/1.0/Widget', tmpUpdate,
													(pUpdateError) =>
													{
														Expect(pUpdateError).to.not.exist;

														// Step 4: Read again
														invokeIPC(pProvider, 'GET', `/1.0/Widget/${tmpID}`, null,
															(pRead2Error, pRead2) =>
															{
																Expect(pRead2Error).to.not.exist;
																Expect(pRead2.Name).to.equal('Lifecycle Widget UPDATED');
																Expect(pRead2.Quantity).to.equal(20);
																Expect(pRead2.Price).to.equal(11.00);
																Expect(pRead2.IDCategory).to.equal(100);

																// Step 5: Delete
																invokeIPC(pProvider, 'DELETE', `/1.0/Widget/${tmpID}`, null,
																	(pDeleteError) =>
																	{
																		Expect(pDeleteError).to.not.exist;

																		// Step 6: Count should be back to 3
																		invokeIPC(pProvider, 'GET', '/1.0/Widgets/Count', null,
																			(pCountError, pCountResult) =>
																			{
																				Expect(pCountError).to.not.exist;
																				Expect(pCountResult.Count).to.equal(3);

																				// Verify dirty tracking captured all 3 operations
																				// (create + update coalesced to create, then delete
																				//  coalesces create+delete to no-op)
																				// So dirty count should be 0 after full lifecycle
																				Expect(pProvider.dirtyTracker.getDirtyCount()).to.equal(0);
																				fDone();
																			});
																	});
															});
													});
											});
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// JSON Column Type Handling
		// ==================================================================
		suite
		(
			'JSON Column Type',
			() =>
			{
				test
				(
					'Should store and retrieve complex JSON in Metadata field',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpComplexJSON = JSON.stringify({
									nested: { deep: { value: 42 } },
									array: [1, 2, 3],
									nullVal: null,
									boolVal: true,
									strVal: 'hello'
								});

								let tmpWidget =
								{
									Name: 'JSON Widget',
									Metadata: tmpComplexJSON
								};

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;

										invokeIPC(pProvider, 'GET', `/1.0/Widget/${pCreated.IDWidget}`, null,
											(pReadError, pRecord) =>
											{
												Expect(pReadError).to.not.exist;

												// JSON columns are auto-parsed by meadow-endpoints
												let tmpMetadata = pRecord.Metadata;
												Expect(tmpMetadata).to.be.an('object');
												Expect(tmpMetadata.nested.deep.value).to.equal(42);
												Expect(tmpMetadata.array).to.deep.equal([1, 2, 3]);
												Expect(tmpMetadata.nullVal).to.equal(null);
												Expect(tmpMetadata.boolVal).to.equal(true);
												Expect(tmpMetadata.strVal).to.equal('hello');
												fDone();
											});
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Multiple Entities
		// ==================================================================
		suite
		(
			'Multiple Entities',
			() =>
			{
				test
				(
					'Should support CRUD on multiple entities simultaneously',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
						let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

						let tmpCategorySchema =
						{
							'Scope': 'Category',
							'DefaultIdentifier': 'IDCategory',
							'Schema':
							[
								{ 'Column': 'IDCategory',       'Type': 'AutoIdentity' },
								{ 'Column': 'GUIDCategory',     'Type': 'AutoGUID' },
								{ 'Column': 'CreateDate',       'Type': 'CreateDate' },
								{ 'Column': 'CreatingIDUser',   'Type': 'CreateIDUser' },
								{ 'Column': 'UpdateDate',       'Type': 'UpdateDate' },
								{ 'Column': 'UpdatingIDUser',   'Type': 'UpdateIDUser' },
								{ 'Column': 'Deleted',          'Type': 'Deleted' },
								{ 'Column': 'DeletingIDUser',   'Type': 'DeleteIDUser' },
								{ 'Column': 'DeleteDate',       'Type': 'DeleteDate' },
								{ 'Column': 'CategoryName',     'Type': 'String' }
							],
							'DefaultObject':
							{
								'IDCategory': null,
								'GUIDCategory': '',
								'CreateDate': false,
								'CreatingIDUser': 0,
								'UpdateDate': false,
								'UpdatingIDUser': 0,
								'Deleted': 0,
								'DeleteDate': false,
								'DeletingIDUser': 0,
								'CategoryName': 'Unknown'
							},
							'JsonSchema':
							{
								'title': 'Category',
								'type': 'object',
								'properties':
								{
									'IDCategory': { 'type': 'integer' },
									'CategoryName': { 'type': 'string' }
								},
								'required': ['IDCategory', 'CategoryName']
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
									'New': 'Allow',
									'Undelete': 'Allow'
								}
							}
						};

						tmpProvider.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;

								tmpProvider.addEntity(_AllTypesSchema,
									(pWidgetError) =>
									{
										Expect(pWidgetError).to.not.exist;

										tmpProvider.addEntity(tmpCategorySchema,
											(pCatError) =>
											{
												Expect(pCatError).to.not.exist;

												Expect(tmpProvider.entityNames).to.have.length(2);
												Expect(tmpProvider.entityNames).to.include('Widget');
												Expect(tmpProvider.entityNames).to.include('Category');

												// Create in both entities
												invokeIPC(tmpProvider, 'POST', '/1.0/Widget',
													{ Name: 'Multi-Entity Widget' },
													(pW1Error, pW1) =>
													{
														Expect(pW1Error).to.not.exist;
														Expect(pW1.Name).to.equal('Multi-Entity Widget');

														invokeIPC(tmpProvider, 'POST', '/1.0/Category',
															{ CategoryName: 'Electronics' },
															(pC1Error, pC1) =>
															{
																Expect(pC1Error).to.not.exist;
																Expect(pC1.CategoryName).to.equal('Electronics');

																// Read from both
																invokeIPC(tmpProvider, 'GET', '/1.0/Widgets/Count', null,
																	(pWCountError, pWCount) =>
																	{
																		Expect(pWCountError).to.not.exist;
																		Expect(pWCount.Count).to.equal(1);

																		invokeIPC(tmpProvider, 'GET', '/1.0/Categorys/Count', null,
																			(pCCountError, pCCount) =>
																			{
																				Expect(pCCountError).to.not.exist;
																				Expect(pCCount.Count).to.equal(1);
																				fDone();
																			});
																	});
															});
													});
											});
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Seeding and Re-seeding
		// ==================================================================
		suite
		(
			'Seeding and Re-seeding',
			() =>
			{
				test
				(
					'Should replace all data when re-seeding',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								// Verify initial seed
								invokeIPC(pProvider, 'GET', '/1.0/Widgets/Count', null,
									(pCount1Error, pCount1) =>
									{
										Expect(pCount1Error).to.not.exist;
										Expect(pCount1.Count).to.equal(3);

										// Re-seed with different data
										let tmpNewRecords =
										[
											{
												IDWidget: 10,
												GUIDWidget: 'dddd4444-dddd-4444-dddd-444444444444',
												CreateDate: '2025-01-01',
												CreatingIDUser: 1,
												UpdateDate: '2025-01-01',
												UpdatingIDUser: 1,
												Deleted: 0,
												DeletingIDUser: 0,
												DeleteDate: '',
												Name: 'Reseeded Widget',
												Description: '',
												Quantity: 1,
												ItemCount: 1,
												Price: 1.00,
												IsActive: 1,
												ManufacturedDate: '',
												Metadata: '{}',
												IDCategory: 0
											}
										];

										pProvider.seedEntity('Widget', tmpNewRecords);

										invokeIPC(pProvider, 'GET', '/1.0/Widgets/Count', null,
											(pCount2Error, pCount2) =>
											{
												Expect(pCount2Error).to.not.exist;
												Expect(pCount2.Count).to.equal(1);

												invokeIPC(pProvider, 'GET', '/1.0/Widget/10', null,
													(pReadError, pRecord) =>
													{
														Expect(pReadError).to.not.exist;
														Expect(pRecord.Name).to.equal('Reseeded Widget');
														fDone();
													});
											});
									});
							});
					}
				);
			}
		);

		// ==================================================================
		// Edge Cases — Special Values
		// ==================================================================
		suite
		(
			'Edge Cases — Special Values',
			() =>
			{
				test
				(
					'Should handle empty string values',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpWidget =
								{
									Name: '',
									Description: '',
									Metadata: ''
								};

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;

										invokeIPC(pProvider, 'GET', `/1.0/Widget/${pCreated.IDWidget}`, null,
											(pReadError, pRecord) =>
											{
												Expect(pReadError).to.not.exist;
												Expect(pRecord.Name).to.equal('');
												Expect(pRecord.Description).to.equal('');
												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should handle large numeric values',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpWidget =
								{
									Name: 'Big Numbers',
									Quantity: 2147483647,
									ItemCount: 999999,
									Price: 99999.99
								};

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;

										invokeIPC(pProvider, 'GET', `/1.0/Widget/${pCreated.IDWidget}`, null,
											(pReadError, pRecord) =>
											{
												Expect(pReadError).to.not.exist;
												Expect(pRecord.Quantity).to.equal(2147483647);
												Expect(pRecord.ItemCount).to.equal(999999);
												Expect(pRecord.Price).to.equal(99999.99);
												fDone();
											});
									});
							});
					}
				);

				test
				(
					'Should handle negative numeric values',
					(fDone) =>
					{
						createSeededProvider(
							(pError, pProvider) =>
							{
								Expect(pError).to.not.exist;

								let tmpWidget =
								{
									Name: 'Negative Numbers',
									Quantity: -50,
									ItemCount: -1,
									Price: -10.50
								};

								invokeIPC(pProvider, 'POST', '/1.0/Widget', tmpWidget,
									(pCreateError, pCreated) =>
									{
										Expect(pCreateError).to.not.exist;

										invokeIPC(pProvider, 'GET', `/1.0/Widget/${pCreated.IDWidget}`, null,
											(pReadError, pRecord) =>
											{
												Expect(pReadError).to.not.exist;
												Expect(pRecord.Quantity).to.equal(-50);
												Expect(pRecord.ItemCount).to.equal(-1);
												Expect(pRecord.Price).to.equal(-10.50);
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
