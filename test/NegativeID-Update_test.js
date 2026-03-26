/**
 * Negative ID Update Test
 *
 * Reproduces the offline form save failure:
 *   1. Create a record with negative IDs enabled → gets ID -1
 *   2. Update that record via PUT /1.0/Entity → should succeed
 *
 * The form creates a Document offline (gets a negative ID), then
 * tries to save/update it. The update fails with:
 *   "Record update failure - a valid record ID is required"
 *
 * This test isolates that flow in the offline provider without
 * any iOS/native dependencies.
 *
 * @license MIT
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');
const libMeadowProviderOffline = require('../source/Meadow-Provider-Offline.js');

const _FableConfig =
{
	'Product': 'NegativeIDUpdateTest',
	'ProductVersion': '0.0.1',
	'UUID': { 'DataCenter': 0, 'Worker': 0 },
	'LogStreams': [{ 'streamtype': 'console' }]
};

const _DocumentSchema =
{
	'Scope': 'Document',
	'DefaultIdentifier': 'IDDocument',
	'Schema':
	[
		{ 'Column': 'IDDocument',       'Type': 'AutoIdentity' },
		{ 'Column': 'GUIDDocument',     'Type': 'AutoGUID' },
		{ 'Column': 'CreateDate',       'Type': 'CreateDate' },
		{ 'Column': 'CreatingIDUser',   'Type': 'CreateIDUser' },
		{ 'Column': 'UpdateDate',       'Type': 'UpdateDate' },
		{ 'Column': 'UpdatingIDUser',   'Type': 'UpdateIDUser' },
		{ 'Column': 'Deleted',          'Type': 'Deleted' },
		{ 'Column': 'DeletingIDUser',   'Type': 'DeleteIDUser' },
		{ 'Column': 'DeleteDate',       'Type': 'DeleteDate' },
		{ 'Column': 'Name',             'Type': 'String', 'Size': 255 },
		{ 'Column': 'FormData',         'Type': 'Text' },
		{ 'Column': 'Status',           'Type': 'String', 'Size': 64 },
		{ 'Column': 'IDProject',        'Type': 'Integer' }
	],
	'DefaultObject':
	{
		'IDDocument': null,
		'GUIDDocument': '',
		'CreateDate': false,
		'CreatingIDUser': 0,
		'UpdateDate': false,
		'UpdatingIDUser': 0,
		'Deleted': 0,
		'DeleteDate': false,
		'DeletingIDUser': 0,
		'Name': '',
		'FormData': '{}',
		'Status': 'Draft',
		'IDProject': 0
	},
	'JsonSchema':
	{
		'title': 'Document',
		'description': 'A document entity.',
		'type': 'object',
		'properties':
		{
			'IDDocument': { 'type': 'integer' },
			'Name': { 'type': 'string' },
			'FormData': { 'type': 'string' },
			'Status': { 'type': 'string' },
			'IDProject': { 'type': 'integer' }
		},
		'required': ['IDDocument']
	},
	'Authorization':
	{
		'__DefaultAPISecurity':
		{
			'Create': 'Allow', 'Read': 'Allow', 'Reads': 'Allow',
			'Update': 'Allow', 'Delete': 'Allow', 'Count': 'Allow',
			'Schema': 'Allow', 'Validate': 'Allow', 'New': 'Allow',
			'Upsert': 'Allow'
		}
	}
};

/**
 * Helper: create a provider, initialize, register Document entity,
 * enable negative IDs, and connect a mock RestClient.
 */
function createProvider(fCallback)
{
	let tmpFable = new libFable(_FableConfig);
	tmpFable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
	let tmpProvider = tmpFable.serviceManager.instantiateServiceProvider('MeadowProviderOffline');

	tmpProvider.initializeAsync(
		(pError) =>
		{
			if (pError) return fCallback(pError);

			tmpProvider.addEntities([_DocumentSchema],
				(pEntitiesError) =>
				{
					if (pEntitiesError) return fCallback(pEntitiesError);

					tmpProvider.enableNegativeIDs();

					// Create a mock RestClient and connect the interceptor
					let tmpMockRestClient =
					{
						preRequest: (pOptions) => pOptions,
						executeJSONRequest: (pOptions, fCB) =>
						{
							// Should never be called — everything should be intercepted
							fCB(new Error('Unexpected network call: ' + pOptions.method + ' ' + pOptions.url));
						},
						executeChunkedRequest: (pOptions, fCB) =>
						{
							fCB(new Error('Unexpected chunked call'));
						}
					};

					tmpProvider.connect(tmpMockRestClient);

					fCallback(null, tmpProvider, tmpMockRestClient);
				});
		});
}

suite
(
	'Negative-ID-Update',
	() =>
	{
		test
		(
			'Should create a record with a negative ID',
			(fDone) =>
			{
				createProvider(
					(pError, pProvider, pRestClient) =>
					{
						Expect(pError).to.not.exist;

						pRestClient.executeJSONRequest(
						{
							url: '/1.0/Document',
							method: 'POST',
							body: { Name: 'Test Document', FormData: '{"field1":"value1"}', IDProject: 123 }
						},
						(pCreateError, pResponse, pBody) =>
						{
							console.log('CREATE response:', JSON.stringify(pBody, null, 2));
							Expect(pCreateError).to.not.exist;
							Expect(pBody).to.be.an('object');
							Expect(pBody.IDDocument).to.be.a('number');
							Expect(pBody.IDDocument).to.be.below(0, 'Expected negative ID for offline-created record');
							Expect(pBody.Name).to.equal('Test Document');
							fDone();
						});
					});
			}
		);

		test
		(
			'Should update a record with a negative ID',
			(fDone) =>
			{
				createProvider(
					(pError, pProvider, pRestClient) =>
					{
						Expect(pError).to.not.exist;

						// Step 1: Create
						pRestClient.executeJSONRequest(
						{
							url: '/1.0/Document',
							method: 'POST',
							body: { Name: 'Original Name', FormData: '{}', IDProject: 123 }
						},
						(pCreateError, pCreateResponse, pCreatedRecord) =>
						{
							Expect(pCreateError).to.not.exist;
							let tmpNegativeID = pCreatedRecord.IDDocument;
							console.log('Created record with ID:', tmpNegativeID);
							Expect(tmpNegativeID).to.be.below(0);

							// Step 2: Update via PUT /1.0/Document
							// This is the call that fails in the iOS form with:
							// "Record update failure - a valid record ID is required"
							let tmpUpdatedRecord = Object.assign({}, pCreatedRecord);
							tmpUpdatedRecord.Name = 'Updated Name';
							tmpUpdatedRecord.FormData = '{"field1":"updated"}';

							pRestClient.executeJSONRequest(
							{
								url: '/1.0/Document',
								method: 'PUT',
								body: tmpUpdatedRecord
							},
							(pUpdateError, pUpdateResponse, pUpdatedBody) =>
							{
								console.log('UPDATE error:', pUpdateError);
								console.log('UPDATE response:', JSON.stringify(pUpdatedBody, null, 2));

								Expect(pUpdateError).to.not.exist;
								Expect(pUpdatedBody).to.be.an('object');
								Expect(pUpdatedBody.IDDocument).to.equal(tmpNegativeID);
								Expect(pUpdatedBody.Name).to.equal('Updated Name');
								fDone();
							});
						});
					});
			}
		);

		test
		(
			'Should read back the updated record by negative ID',
			(fDone) =>
			{
				createProvider(
					(pError, pProvider, pRestClient) =>
					{
						Expect(pError).to.not.exist;

						// Create
						pRestClient.executeJSONRequest(
						{
							url: '/1.0/Document',
							method: 'POST',
							body: { Name: 'Read Test', FormData: '{}', IDProject: 456 }
						},
						(pCreateError, pCreateResponse, pCreatedRecord) =>
						{
							Expect(pCreateError).to.not.exist;
							let tmpID = pCreatedRecord.IDDocument;

							// Update
							let tmpUpdated = Object.assign({}, pCreatedRecord);
							tmpUpdated.Name = 'Read Test Updated';

							pRestClient.executeJSONRequest(
							{
								url: '/1.0/Document',
								method: 'PUT',
								body: tmpUpdated
							},
							(pUpdateError, pUpdateResponse, pUpdatedBody) =>
							{
								// Read back
								pRestClient.executeJSONRequest(
								{
									url: '/1.0/Document/' + tmpID,
									method: 'GET'
								},
								(pReadError, pReadResponse, pReadBody) =>
								{
									console.log('READ response:', JSON.stringify(pReadBody, null, 2));
									Expect(pReadError).to.not.exist;
									Expect(pReadBody).to.be.an('object');
									Expect(pReadBody.IDDocument).to.equal(tmpID);
									Expect(pReadBody.Name).to.equal('Read Test Updated');
									fDone();
								});
							});
						});
					});
			}
		);
	}
);
