/**
 * Negative ID Tests
 *
 * Tests that offline-created records get negative IDs to prevent
 * collisions with server-assigned positive IDs.
 *
 * @license MIT
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');

const libMeadowProviderOffline = require('../source/Meadow-Provider-Offline.js');

const _FableConfig =
{
	'Product': 'NegativeIDTest',
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

const _SessionConfig =
{
	SessionDataSource: 'None',
	DefaultSessionObject:
	{
		CustomerID: 1,
		SessionID: 'negative-id-test',
		DeviceID: 'TestRunner',
		UserID: 1,
		UserRole: 'Administrator',
		UserRoleIndex: 255,
		LoggedIn: true
	}
};

/**
 * Helper to invoke an IPC route and parse the response.
 * Uses setImmediate to prevent assertion errors from being swallowed
 * by orator's internal try-catch.
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
					try
					{
						tmpParsed = JSON.parse(pResponseData);
					}
					catch (e)
					{
						// leave as string
					}
				}

				return fCallback(null, tmpParsed);
			});
		});
}


suite
(
	'Negative ID Assignment',
	function ()
	{
		this.timeout(15000);

		test
		(
			'Should assign negative IDs when enabled',
			(fDone) =>
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

								tmpProvider.enableNegativeIDs();
								Expect(tmpProvider.getNextNegativeID('Book')).to.equal(-1);

								invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'Offline Book 1' },
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.IDBook).to.equal(-1);
										Expect(pData.Title).to.equal('Offline Book 1');
										Expect(tmpProvider.getNextNegativeID('Book')).to.equal(-2);

										invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'Offline Book 2' },
											(pErr2, pData2) =>
											{
												Expect(pErr2).to.not.exist;
												Expect(pData2.IDBook).to.equal(-2);

												let tmpRows = tmpProvider.dataCacheManager.db
													.prepare('SELECT * FROM Book ORDER BY IDBook')
													.all();
												Expect(tmpRows).to.have.length(2);
												Expect(tmpRows[0].IDBook).to.equal(-2);
												Expect(tmpRows[1].IDBook).to.equal(-1);
												fDone();
											});
									});
							});
					});
			}
		);

		test
		(
			'Should assign positive AUTOINCREMENT IDs when disabled (default)',
			(fDone) =>
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

								invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'Regular Book' },
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.IDBook).to.be.greaterThan(0);
										fDone();
									});
							});
					});
			}
		);

		test
		(
			'Should NOT affect seeded records (positive IDs preserved)',
			(fDone) =>
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

								tmpProvider.seedEntity('Book',
								[
									{ IDBook: 100, GUIDBook: 's1', Title: 'Seeded Book', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
								]);

								tmpProvider.enableNegativeIDs();

								invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'New Offline Book' },
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.IDBook).to.equal(-1);

										let tmpRows = tmpProvider.dataCacheManager.db
											.prepare('SELECT * FROM Book ORDER BY IDBook')
											.all();
										Expect(tmpRows).to.have.length(2);
										Expect(tmpRows[0].IDBook).to.equal(-1);
										Expect(tmpRows[1].IDBook).to.equal(100);

										invokeIPC(tmpProvider, 'GET', '/1.0/Book/100', null,
											(pErr2, pData2) =>
											{
												Expect(pErr2).to.not.exist;
												Expect(pData2.Title).to.equal('Seeded Book');
												fDone();
											});
									});
							});
					});
			}
		);

		test
		(
			'Should track negative IDs in DirtyRecordTracker',
			(fDone) =>
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
								tmpProvider.enableNegativeIDs();

								invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'Tracked Book' },
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.IDBook).to.equal(-1);

										let tmpMutations = tmpProvider.dirtyTracker.getDirtyMutations();
										Expect(tmpMutations).to.have.length(1);
										Expect(tmpMutations[0].entity).to.equal('Book');
										Expect(tmpMutations[0].id).to.equal(-1);
										Expect(tmpMutations[0].operation).to.equal('create');
										Expect(tmpMutations[0].record.Title).to.equal('Tracked Book');
										fDone();
									});
							});
					});
			}
		);

		test
		(
			'Should read back a negative-ID record via IPC',
			(fDone) =>
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
								tmpProvider.enableNegativeIDs();

								invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'Negative Read Test' },
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.IDBook).to.equal(-1);

										invokeIPC(tmpProvider, 'GET', '/1.0/Book/-1', null,
											(pErr2, pData2) =>
											{
												Expect(pErr2).to.not.exist;
												Expect(pData2.IDBook).to.equal(-1);
												Expect(pData2.Title).to.equal('Negative Read Test');
												fDone();
											});
									});
							});
					});
			}
		);

		test
		(
			'Should disable negative IDs and revert to AUTOINCREMENT',
			(fDone) =>
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
								tmpProvider.enableNegativeIDs();

								invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'Before Disable' },
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.IDBook).to.equal(-1);

										tmpProvider.disableNegativeIDs();

										invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'After Disable' },
											(pErr2, pData2) =>
											{
												Expect(pErr2).to.not.exist;
												Expect(pData2.IDBook).to.be.greaterThan(0);
												fDone();
											});
									});
							});
					});
			}
		);
		test
		(
			'Should start below existing negative IDs (persistence across sessions)',
			(fDone) =>
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

								// Simulate persisted records from a previous session
								// by directly inserting negative-ID records into SQLite
								tmpProvider.dataCacheManager.db.exec(
									"INSERT INTO Book (IDBook, GUIDBook, Title) VALUES (-1, 'g1', 'Previous Session 1')");
								tmpProvider.dataCacheManager.db.exec(
									"INSERT INTO Book (IDBook, GUIDBook, Title) VALUES (-2, 'g2', 'Previous Session 2')");
								tmpProvider.dataCacheManager.db.exec(
									"INSERT INTO Book (IDBook, GUIDBook, Title) VALUES (-3, 'g3', 'Previous Session 3')");

								tmpProvider.enableNegativeIDs();

								// Next ID should be -4 (below existing -3)
								Expect(tmpProvider.getNextNegativeID('Book')).to.equal(-4);

								invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'New Session Book' },
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.IDBook).to.equal(-4);

										// Next should be -5
										Expect(tmpProvider.getNextNegativeID('Book')).to.equal(-5);

										fDone();
									});
							});
					});
			}
		);

		test
		(
			'Should remap a negative ID to a positive server ID',
			(fDone) =>
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
								tmpProvider.enableNegativeIDs();

								invokeIPC(tmpProvider, 'POST', '/1.0/Book', { Title: 'Remap Test' },
									(pErr, pData) =>
									{
										Expect(pErr).to.not.exist;
										Expect(pData.IDBook).to.equal(-1);

										// Simulate sync: server assigned ID 500
										let tmpUpdated = tmpProvider.remapID('Book', -1, 500);
										Expect(tmpUpdated).to.equal(1);

										// Verify the record now has the server ID
										let tmpRows = tmpProvider.dataCacheManager.db
											.prepare('SELECT * FROM Book WHERE IDBook = 500')
											.all();
										Expect(tmpRows).to.have.length(1);
										Expect(tmpRows[0].Title).to.equal('Remap Test');

										// Old negative ID should be gone
										let tmpOldRows = tmpProvider.dataCacheManager.db
											.prepare('SELECT * FROM Book WHERE IDBook = -1')
											.all();
										Expect(tmpOldRows).to.have.length(0);

										// Verify the record is readable via IPC at the new ID
										invokeIPC(tmpProvider, 'GET', '/1.0/Book/500', null,
											(pErr2, pData2) =>
											{
												Expect(pErr2).to.not.exist;
												Expect(pData2.Title).to.equal('Remap Test');
												fDone();
											});
									});
							});
					});
			}
		);

		test
		(
			'Should remap foreign keys in related tables',
			(fDone) =>
			{
				let tmpFable = new libFable(_FableConfig);
				tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
				let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', _SessionConfig);

				// Schema for a join table that references Book
				let tmpBookReviewSchema =
				{
					'Scope': 'BookReview',
					'DefaultIdentifier': 'IDBookReview',
					'Schema':
					[
						{ 'Column': 'IDBookReview',    'Type': 'AutoIdentity' },
						{ 'Column': 'GUIDBookReview',  'Type': 'AutoGUID' },
						{ 'Column': 'CreateDate',      'Type': 'CreateDate' },
						{ 'Column': 'CreatingIDUser',  'Type': 'CreateIDUser' },
						{ 'Column': 'UpdateDate',      'Type': 'UpdateDate' },
						{ 'Column': 'UpdatingIDUser',  'Type': 'UpdateIDUser' },
						{ 'Column': 'Deleted',         'Type': 'Deleted' },
						{ 'Column': 'DeletingIDUser',  'Type': 'DeleteIDUser' },
						{ 'Column': 'DeleteDate',      'Type': 'DeleteDate' },
						{ 'Column': 'IDBook',          'Type': 'ForeignKey' },
						{ 'Column': 'Rating',          'Type': 'Integer' }
					],
					'DefaultObject':
					{
						'IDBookReview': null, 'GUIDBookReview': '', 'CreateDate': false,
						'CreatingIDUser': 0, 'UpdateDate': false, 'UpdatingIDUser': 0,
						'Deleted': 0, 'DeleteDate': false, 'DeletingIDUser': 0,
						'IDBook': 0, 'Rating': 0
					},
					'JsonSchema': { 'title': 'BookReview', 'type': 'object', 'properties': { 'IDBookReview': { 'type': 'integer' } }, 'required': ['IDBookReview'] },
					'Authorization': { 'Administrator': { 'Create': 'Allow', 'Read': 'Allow', 'Reads': 'Allow', 'Update': 'Allow', 'Delete': 'Allow', 'Count': 'Allow', 'Schema': 'Allow', 'Validate': 'Allow', 'New': 'Allow' } }
				};

				tmpProvider.initializeAsync(
					(pError) =>
					{
						Expect(pError).to.not.exist;

						tmpProvider.addEntities([_BookSchema, tmpBookReviewSchema],
							(pEntityError) =>
							{
								Expect(pEntityError).to.not.exist;

								// Insert a Book with negative ID and a BookReview referencing it
								tmpProvider.dataCacheManager.db.exec(
									"INSERT INTO Book (IDBook, GUIDBook, Title) VALUES (-1, 'g1', 'FK Test Book')");
								tmpProvider.dataCacheManager.db.exec(
									"INSERT INTO BookReview (IDBookReview, GUIDBookReview, IDBook, Rating) VALUES (1, 'r1', -1, 5)");
								tmpProvider.dataCacheManager.db.exec(
									"INSERT INTO BookReview (IDBookReview, GUIDBookReview, IDBook, Rating) VALUES (2, 'r2', -1, 3)");

								// Remap Book ID -1 → 42
								let tmpUpdated = tmpProvider.remapID('Book', -1, 42);
								// 1 Book row + 2 BookReview FK rows = 3
								Expect(tmpUpdated).to.equal(3);

								// Book row remapped
								let tmpBook = tmpProvider.dataCacheManager.db
									.prepare('SELECT * FROM Book WHERE IDBook = 42').get();
								Expect(tmpBook).to.exist;
								Expect(tmpBook.Title).to.equal('FK Test Book');

								// BookReview FK references updated
								let tmpReviews = tmpProvider.dataCacheManager.db
									.prepare('SELECT * FROM BookReview WHERE IDBook = 42 ORDER BY IDBookReview')
									.all();
								Expect(tmpReviews).to.have.length(2);
								Expect(tmpReviews[0].Rating).to.equal(5);
								Expect(tmpReviews[1].Rating).to.equal(3);

								// No rows should reference the old ID
								let tmpStaleReviews = tmpProvider.dataCacheManager.db
									.prepare('SELECT * FROM BookReview WHERE IDBook = -1')
									.all();
								Expect(tmpStaleReviews).to.have.length(0);

								fDone();
							});
					});
			}
		);

		test
		(
			'Should return -1 for entity with only positive IDs',
			(fDone) =>
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

								// Seed only positive IDs
								tmpProvider.seedEntity('Book',
								[
									{ IDBook: 50, GUIDBook: 'p1', Title: 'Positive Book', CreateDate: '', CreatingIDUser: 1, UpdateDate: '', UpdatingIDUser: 1, Deleted: 0, DeletingIDUser: 0, DeleteDate: '' }
								]);

								// Next negative ID should still be -1
								Expect(tmpProvider.getNextNegativeID('Book')).to.equal(-1);
								fDone();
							});
					});
			}
		);
	}
);
