/**
 * Dirty-Record-Tracker - Tracks local mutations for offline mode.
 *
 * Tracks which records have been created, updated, or deleted locally
 * and need to be synced back to the server. Includes coalescing logic
 * (e.g., create then delete = no-op, create then update = create with
 * latest data).
 *
 * @license MIT
 */
const libFableServiceBase = require('fable-serviceproviderbase');

/**
 * @typedef {object} DirtyMutation
 * @property {string} entity - The entity name (e.g., "Book")
 * @property {number|string} id - The record ID
 * @property {string} operation - The operation type: 'create', 'update', 'delete'
 * @property {object} record - The full record data at time of mutation
 * @property {number} timestamp - When the mutation occurred
 */

/**
 * @typedef {object} BinaryMutation
 * @property {string} entity - The entity name (e.g., "Artifact")
 * @property {number|string} id - The record ID
 * @property {string} blobKey - The BlobStore key (e.g., "Artifact:3:v1")
 * @property {string} mimeType - MIME type of the binary data
 * @property {number} timestamp - When the mutation occurred
 */

/**
 * @class DirtyRecordTracker
 * @extends libFableServiceBase
 */
class DirtyRecordTracker extends libFableServiceBase
{
	/**
	 * @param {object} pFable - The Fable instance
	 * @param {object} pOptions - Service options
	 * @param {string} pServiceHash - Service hash
	 */
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'DirtyRecordTracker';

		/** @type {DirtyMutation[]} */
		this._mutations = [];

		/** @type {Record<string, number>} Maps "Entity:ID" to mutation index */
		this._dirtyMap = {};

		/** @type {BinaryMutation[]} */
		this._binaryMutations = [];

		/** @type {Record<string, number>} Maps "Entity:ID" to binary mutation index */
		this._binaryDirtyMap = {};
	}

	/**
	 * Track a local mutation.
	 *
	 * @param {string} pEntity - Entity name
	 * @param {number|string} pIDRecord - Record ID
	 * @param {string} pOperation - 'create', 'update', or 'delete'
	 * @param {object} pRecord - The record data
	 */
	trackMutation(pEntity, pIDRecord, pOperation, pRecord)
	{
		let tmpKey = `${pEntity}:${pIDRecord}`;
		let tmpMutation = {
			entity: pEntity,
			id: pIDRecord,
			operation: pOperation,
			record: JSON.parse(JSON.stringify(pRecord)),
			timestamp: Date.now()
		};

		if (this._dirtyMap.hasOwnProperty(tmpKey))
		{
			let tmpExistingIndex = this._dirtyMap[tmpKey];
			let tmpExisting = this._mutations[tmpExistingIndex];

			// Coalescing logic
			if (tmpExisting.operation === 'create' && pOperation === 'delete')
			{
				// Created then deleted locally — remove both
				this._mutations.splice(tmpExistingIndex, 1);
				delete this._dirtyMap[tmpKey];
				this._rebuildDirtyMap();
				return;
			}
			if (tmpExisting.operation === 'create' && pOperation === 'update')
			{
				// Created then updated — keep as create with latest data
				tmpMutation.operation = 'create';
			}

			this._mutations[tmpExistingIndex] = tmpMutation;
		}
		else
		{
			this._dirtyMap[tmpKey] = this._mutations.length;
			this._mutations.push(tmpMutation);
		}
	}

	/**
	 * Get all pending dirty mutations.
	 *
	 * @returns {DirtyMutation[]}
	 */
	getDirtyMutations()
	{
		return this._mutations.slice();
	}

	/**
	 * Get the count of pending dirty mutations.
	 *
	 * @returns {number}
	 */
	getDirtyCount()
	{
		return this._mutations.length;
	}

	/**
	 * Get dirty mutations for a specific entity.
	 *
	 * @param {string} pEntity - Entity name
	 * @returns {DirtyMutation[]}
	 */
	getDirtyMutationsForEntity(pEntity)
	{
		return this._mutations.filter((pMutation) => pMutation.entity === pEntity);
	}

	/**
	 * Clear a specific mutation after successful sync.
	 *
	 * @param {string} pEntity - Entity name
	 * @param {number|string} pIDRecord - Record ID
	 */
	clearMutation(pEntity, pIDRecord)
	{
		let tmpKey = `${pEntity}:${pIDRecord}`;
		if (this._dirtyMap.hasOwnProperty(tmpKey))
		{
			this._mutations.splice(this._dirtyMap[tmpKey], 1);
			delete this._dirtyMap[tmpKey];
			this._rebuildDirtyMap();
		}
	}

	/**
	 * Clear all mutations for a specific entity.
	 *
	 * @param {string} pEntity - Entity name
	 */
	clearEntity(pEntity)
	{
		this._mutations = this._mutations.filter((pMutation) => pMutation.entity !== pEntity);
		this._rebuildDirtyMap();
	}

	/**
	 * Clear all mutations (entity and binary).
	 */
	clearAll()
	{
		this._mutations = [];
		this._dirtyMap = {};
		this._binaryMutations = [];
		this._binaryDirtyMap = {};
	}

	/**
	 * Check if there are any dirty records.
	 *
	 * @returns {boolean}
	 */
	hasDirtyRecords()
	{
		return this._mutations.length > 0;
	}

	/**
	 * Check if a specific entity has dirty records.
	 *
	 * @param {string} pEntity - Entity name
	 * @returns {boolean}
	 */
	hasEntityDirtyRecords(pEntity)
	{
		return this._mutations.some((pMutation) => pMutation.entity === pEntity);
	}

	// ========================================================================
	// Binary Mutation Tracking
	// ========================================================================

	/**
	 * Track a binary mutation (media upload that needs syncing).
	 *
	 * Binary mutations are tracked separately from entity mutations
	 * because binary uploads must happen AFTER entity records are
	 * synced to the server (to get server-assigned IDs).
	 *
	 * @param {string} pEntity - Entity name (e.g., "Artifact")
	 * @param {number|string} pIDRecord - Record ID
	 * @param {string} pBlobKey - BlobStore key (e.g., "Artifact:3:v1")
	 * @param {string} pMimeType - MIME type of the binary data
	 */
	trackBinaryMutation(pEntity, pIDRecord, pBlobKey, pMimeType)
	{
		let tmpKey = `${pEntity}:${pIDRecord}`;
		let tmpMutation = {
			entity: pEntity,
			id: pIDRecord,
			blobKey: pBlobKey,
			mimeType: pMimeType,
			timestamp: Date.now()
		};

		if (this._binaryDirtyMap.hasOwnProperty(tmpKey))
		{
			// Replace existing binary mutation (latest upload wins)
			this._binaryMutations[this._binaryDirtyMap[tmpKey]] = tmpMutation;
		}
		else
		{
			this._binaryDirtyMap[tmpKey] = this._binaryMutations.length;
			this._binaryMutations.push(tmpMutation);
		}
	}

	/**
	 * Get all pending binary mutations.
	 *
	 * @returns {BinaryMutation[]}
	 */
	getBinaryMutations()
	{
		return this._binaryMutations.slice();
	}

	/**
	 * Get binary mutations for a specific entity.
	 *
	 * @param {string} pEntity - Entity name
	 * @returns {BinaryMutation[]}
	 */
	getBinaryMutationsForEntity(pEntity)
	{
		return this._binaryMutations.filter((pMutation) => pMutation.entity === pEntity);
	}

	/**
	 * Clear a specific binary mutation after successful sync.
	 *
	 * @param {string} pEntity - Entity name
	 * @param {number|string} pIDRecord - Record ID
	 */
	clearBinaryMutation(pEntity, pIDRecord)
	{
		let tmpKey = `${pEntity}:${pIDRecord}`;
		if (this._binaryDirtyMap.hasOwnProperty(tmpKey))
		{
			this._binaryMutations.splice(this._binaryDirtyMap[tmpKey], 1);
			delete this._binaryDirtyMap[tmpKey];
			this._rebuildBinaryDirtyMap();
		}
	}

	/**
	 * Check if there are any pending binary mutations.
	 *
	 * @returns {boolean}
	 */
	hasBinaryMutations()
	{
		return this._binaryMutations.length > 0;
	}

	/**
	 * Get the count of pending binary mutations.
	 *
	 * @returns {number}
	 */
	getBinaryDirtyCount()
	{
		return this._binaryMutations.length;
	}

	/**
	 * Rebuild the binary dirty map index after array modifications.
	 * @private
	 */
	_rebuildBinaryDirtyMap()
	{
		this._binaryDirtyMap = {};
		for (let i = 0; i < this._binaryMutations.length; i++)
		{
			let tmpMutation = this._binaryMutations[i];
			this._binaryDirtyMap[`${tmpMutation.entity}:${tmpMutation.id}`] = i;
		}
	}

	/**
	 * Rebuild the dirty map index after array modifications.
	 * @private
	 */
	_rebuildDirtyMap()
	{
		this._dirtyMap = {};
		for (let i = 0; i < this._mutations.length; i++)
		{
			let tmpMutation = this._mutations[i];
			this._dirtyMap[`${tmpMutation.entity}:${tmpMutation.id}`] = i;
		}
	}
}

// Explicitly set isFableService — class field inheritance can break in
// some browserify bundles when the parent module is a different copy.
DirtyRecordTracker.isFableService = true;

module.exports = DirtyRecordTracker;
module.exports.serviceType = 'DirtyRecordTracker';
