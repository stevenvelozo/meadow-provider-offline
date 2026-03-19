/**
 * Tests for BlobStoreManager storage delegate support.
 *
 * Verifies that when a storage delegate is set, all operations
 * route through it instead of IndexedDB. Also tests validation,
 * degraded mode interaction, and the getBlobURL Object URL cache.
 *
 * @license MIT
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');

const libBlobStoreManager = require('../source/Blob-Store-Manager.js');

const _FableConfig =
{
	'Product': 'BlobStoreDelegateTest',
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
 * Creates an in-memory mock delegate that stores blobs in a plain object.
 *
 * @returns {{ delegate: import('../source/Blob-Store-Manager.js').BlobStorageDelegate, store: Object.<string, { blob: *, metadata: * }> }}
 */
function createMockDelegate()
{
	let tmpStore = {};

	let tmpDelegate =
	{
		storeBlob: (pKey, pBlobData, pMetadata, fCallback) =>
		{
			tmpStore[pKey] = { blob: pBlobData, metadata: pMetadata || {} };
			return fCallback(null);
		},
		getBlob: (pKey, fCallback) =>
		{
			let tmpEntry = tmpStore[pKey] || null;
			return fCallback(null, tmpEntry);
		},
		deleteBlob: (pKey, fCallback) =>
		{
			delete tmpStore[pKey];
			return fCallback(null);
		},
		listBlobs: (pPrefix, fCallback) =>
		{
			let tmpResults = [];
			for (let tmpKey of Object.keys(tmpStore))
			{
				if (!pPrefix || tmpKey.startsWith(pPrefix))
				{
					tmpResults.push({ key: tmpKey, metadata: tmpStore[tmpKey].metadata });
				}
			}
			return fCallback(null, tmpResults);
		},
		clearAll: (fCallback) =>
		{
			for (let tmpKey of Object.keys(tmpStore))
			{
				delete tmpStore[tmpKey];
			}
			return fCallback(null);
		}
	};

	return { delegate: tmpDelegate, store: tmpStore };
}

suite
(
	'BlobStoreManager - Storage Delegate',
	() =>
	{
		suite
		(
			'setStorageDelegate validation',
			() =>
			{
				test
				(
					'Should reject falsy delegate.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Falsy');

						tmpBlobStore.setStorageDelegate(null);
						Expect(tmpBlobStore.degraded).to.equal(false);
						Expect(tmpBlobStore._storageDelegate).to.equal(null);
						fDone();
					}
				);

				test
				(
					'Should reject delegate missing required methods.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Missing');

						tmpBlobStore.setStorageDelegate({ storeBlob: () => {}, getBlob: () => {} });
						Expect(tmpBlobStore._storageDelegate).to.equal(null);
						fDone();
					}
				);

				test
				(
					'Should accept a valid delegate.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Valid');

						let tmpMock = createMockDelegate();
						tmpBlobStore.setStorageDelegate(tmpMock.delegate);
						Expect(tmpBlobStore._storageDelegate).to.not.equal(null);
						fDone();
					}
				);
			}
		);

		suite
		(
			'initializeAsync with delegate',
			() =>
			{
				test
				(
					'Should skip IndexedDB when delegate is set before init.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Init');

						let tmpMock = createMockDelegate();
						tmpBlobStore.setStorageDelegate(tmpMock.delegate);

						tmpBlobStore.initializeAsync(
							(pError) =>
							{
								Expect(pError).to.not.exist;
								Expect(tmpBlobStore.initialized).to.equal(true);
								Expect(tmpBlobStore.degraded).to.equal(false);
								Expect(tmpBlobStore._db).to.equal(null);
								fDone();
							});
					}
				);
			}
		);

		suite
		(
			'CRUD operations through delegate',
			() =>
			{
				test
				(
					'Should route storeBlob through delegate.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Store');

						let tmpMock = createMockDelegate();
						tmpBlobStore.setStorageDelegate(tmpMock.delegate);
						tmpBlobStore.initializeAsync(
							() =>
							{
								let tmpData = Buffer.from('hello world');
								let tmpMeta = { mimeType: 'text/plain', fileName: 'test.txt', size: 11, entityType: 'Artifact', entityID: 1, version: 1, createdAt: new Date().toISOString() };

								tmpBlobStore.storeBlob('Artifact:1:v1', tmpData, tmpMeta,
									(pError) =>
									{
										Expect(pError).to.not.exist;
										Expect(tmpMock.store['Artifact:1:v1']).to.exist;
										Expect(tmpMock.store['Artifact:1:v1'].metadata.mimeType).to.equal('text/plain');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should route getBlob through delegate.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Get');

						let tmpMock = createMockDelegate();
						tmpMock.store['Artifact:2:v1'] = { blob: Buffer.from('test data'), metadata: { mimeType: 'image/png' } };

						tmpBlobStore.setStorageDelegate(tmpMock.delegate);
						tmpBlobStore.initializeAsync(
							() =>
							{
								tmpBlobStore.getBlob('Artifact:2:v1',
									(pError, pEntry) =>
									{
										Expect(pError).to.not.exist;
										Expect(pEntry).to.exist;
										Expect(pEntry.metadata.mimeType).to.equal('image/png');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should return null for missing key via delegate.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-GetMissing');

						let tmpMock = createMockDelegate();
						tmpBlobStore.setStorageDelegate(tmpMock.delegate);
						tmpBlobStore.initializeAsync(
							() =>
							{
								tmpBlobStore.getBlob('Artifact:999:v1',
									(pError, pEntry) =>
									{
										Expect(pError).to.not.exist;
										Expect(pEntry).to.equal(null);
										fDone();
									});
							});
					}
				);

				test
				(
					'Should route deleteBlob through delegate.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Delete');

						let tmpMock = createMockDelegate();
						tmpMock.store['Artifact:3:v1'] = { blob: Buffer.from('data'), metadata: {} };

						tmpBlobStore.setStorageDelegate(tmpMock.delegate);
						tmpBlobStore.initializeAsync(
							() =>
							{
								tmpBlobStore.deleteBlob('Artifact:3:v1',
									(pError) =>
									{
										Expect(pError).to.not.exist;
										Expect(tmpMock.store['Artifact:3:v1']).to.not.exist;
										fDone();
									});
							});
					}
				);

				test
				(
					'Should route listBlobs through delegate with prefix filtering.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-List');

						let tmpMock = createMockDelegate();
						tmpMock.store['Artifact:1:v1'] = { blob: Buffer.from('a'), metadata: { entityType: 'Artifact' } };
						tmpMock.store['Artifact:2:v1'] = { blob: Buffer.from('b'), metadata: { entityType: 'Artifact' } };
						tmpMock.store['Photo:1:v1'] = { blob: Buffer.from('c'), metadata: { entityType: 'Photo' } };

						tmpBlobStore.setStorageDelegate(tmpMock.delegate);
						tmpBlobStore.initializeAsync(
							() =>
							{
								tmpBlobStore.listBlobs('Artifact:',
									(pError, pEntries) =>
									{
										Expect(pError).to.not.exist;
										Expect(pEntries).to.have.length(2);
										Expect(pEntries[0].key).to.contain('Artifact:');
										fDone();
									});
							});
					}
				);

				test
				(
					'Should route clearAll through delegate.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Clear');

						let tmpMock = createMockDelegate();
						tmpMock.store['Artifact:1:v1'] = { blob: Buffer.from('a'), metadata: {} };
						tmpMock.store['Artifact:2:v1'] = { blob: Buffer.from('b'), metadata: {} };

						tmpBlobStore.setStorageDelegate(tmpMock.delegate);
						tmpBlobStore.initializeAsync(
							() =>
							{
								tmpBlobStore.clearAll(
									(pError) =>
									{
										Expect(pError).to.not.exist;
										Expect(Object.keys(tmpMock.store)).to.have.length(0);
										fDone();
									});
							});
					}
				);
			}
		);

		suite
		(
			'full store-get-delete lifecycle via delegate',
			() =>
			{
				test
				(
					'Should store, retrieve, and delete a blob through the delegate.',
					(fDone) =>
					{
						let tmpFable = new libFable(_FableConfig);
						tmpFable.serviceManager.addServiceType('BlobStoreManager', libBlobStoreManager);
						let tmpBlobStore = tmpFable.serviceManager.instantiateServiceProvider('BlobStoreManager', {}, 'DelegateTest-Lifecycle');

						let tmpMock = createMockDelegate();
						tmpBlobStore.setStorageDelegate(tmpMock.delegate);
						tmpBlobStore.initializeAsync(
							() =>
							{
								let tmpKey = 'Artifact:10:v1';
								let tmpData = Buffer.from('lifecycle test');
								let tmpMeta = { mimeType: 'application/octet-stream', fileName: 'data.bin', size: 14, entityType: 'Artifact', entityID: 10, version: 1, createdAt: new Date().toISOString() };

								// Store
								tmpBlobStore.storeBlob(tmpKey, tmpData, tmpMeta,
									(pStoreError) =>
									{
										Expect(pStoreError).to.not.exist;

										// Get
										tmpBlobStore.getBlob(tmpKey,
											(pGetError, pEntry) =>
											{
												Expect(pGetError).to.not.exist;
												Expect(pEntry).to.exist;
												Expect(pEntry.metadata.fileName).to.equal('data.bin');

												// Delete
												tmpBlobStore.deleteBlob(tmpKey,
													(pDeleteError) =>
													{
														Expect(pDeleteError).to.not.exist;

														// Verify deleted
														tmpBlobStore.getBlob(tmpKey,
															(pGetError2, pEntry2) =>
															{
																Expect(pGetError2).to.not.exist;
																Expect(pEntry2).to.equal(null);
																fDone();
															});
													});
											});
									});
							});
					}
				);
			}
		);
	}
);
