/**
 * Meadow Provider - Native Bridge (Semantic CRUD)
 *
 * A meadow provider that bridges CRUD operations to a native application
 * (e.g., iOS WKWebView) for execution against native storage. Instead of
 * sending raw SQL (which requires matching schemas), this provider sends
 * **semantic operations** — entity name, operation type, filters, record
 * data, pagination — allowing the native side to translate to its own
 * schema and DAL.
 *
 * The bridge function receives:
 *   {
 *     entity: string,           // e.g., "Document"
 *     operation: string,        // "Create", "Read", "Update", "Delete", "Count"
 *     id: number|string|null,   // Record ID for single-record operations
 *     guid: string|null,        // Record GUID for single-record operations
 *     record: object|null,      // Record data for Create/Update
 *     filters: Array,           // FoxHound filter array for list queries
 *     sort: Array|null,         // Sort directives
 *     begin: number,            // Pagination start (0-based)
 *     cap: number,              // Page size
 *     dataElements: Array|null, // Columns to return (null = all)
 *     schema: Array             // Column schema from meadow
 *   }
 *
 * And must call back with:
 *   {
 *     error: Error|null,
 *     records: Array,            // Array of record objects (keyed by meadow column names)
 *     lastInsertId: number,      // For Create operations
 *     affectedRows: number       // For Update/Delete operations
 *   }
 *
 * The native side is responsible for:
 *   - Mapping meadow column names to native column names
 *   - Translating FoxHound filters to native query criteria
 *   - Returning records with meadow column names (for marshalling)
 *
 * @license MIT
 */
var MeadowProvider = function ()
{
	function createNew(pFable)
	{
		// If a valid Fable object isn't passed in, return a constructor
		if (typeof (pFable) !== 'object')
		{
			return { new: createNew };
		}
		var _Fable = pFable;

		/**
		 * The bridge function for semantic CRUD operations.
		 * @type {function|null}
		 */
		var _Bridge = null;

		/**
		 * Set the bridge function.
		 *
		 * @param {function} pBridgeFunction - function(pOperation, fCallback)
		 */
		var setBridge = function (pBridgeFunction)
		{
			if (typeof pBridgeFunction !== 'function')
			{
				_Fable.log.error('NativeBridge: setBridge called with non-function — ignored.');
				return;
			}
			_Bridge = pBridgeFunction;
			_Fable.log.info('NativeBridge: Bridge function set.');
		};

		var getProvider = function ()
		{
			return { connected: !!_Bridge };
		};

		/**
		 * Marshal a record from the native response format to the
		 * application object format. Handles JSON and JSONProxy columns.
		 *
		 * The native side returns records keyed by meadow column names.
		 * JSON columns may need parsing from string to object.
		 */
		var marshalRecordFromSourceToObject = function (pObject, pRecord, pSchema)
		{
			var tmpJsonColumns = {};
			var tmpProxyColumns = {};
			if (Array.isArray(pSchema))
			{
				for (var s = 0; s < pSchema.length; s++)
				{
					if (pSchema[s].Type === 'JSON')
					{
						tmpJsonColumns[pSchema[s].Column] = true;
					}
					else if (pSchema[s].Type === 'JSONProxy' && pSchema[s].StorageColumn)
					{
						tmpProxyColumns[pSchema[s].StorageColumn] = pSchema[s].Column;
					}
				}
			}

			for (var tmpColumn in pRecord)
			{
				if (tmpJsonColumns[tmpColumn])
				{
					try
					{
						pObject[tmpColumn] = (typeof pRecord[tmpColumn] === 'string')
							? JSON.parse(pRecord[tmpColumn])
							: (pRecord[tmpColumn] || {});
					}
					catch (pParseError)
					{
						pObject[tmpColumn] = {};
					}
				}
				else if (tmpProxyColumns.hasOwnProperty(tmpColumn))
				{
					var tmpVirtualColumn = tmpProxyColumns[tmpColumn];
					try
					{
						pObject[tmpVirtualColumn] = (typeof pRecord[tmpColumn] === 'string')
							? JSON.parse(pRecord[tmpColumn])
							: (pRecord[tmpColumn] || {});
					}
					catch (pParseError)
					{
						pObject[tmpVirtualColumn] = {};
					}
				}
				else
				{
					pObject[tmpColumn] = pRecord[tmpColumn];
				}
			}
		};

		/**
		 * Extract semantic operation info from a FoxHound query object.
		 *
		 * @param {object} pQuery - FoxHound query object
		 * @param {string} pOperation - The CRUD operation name
		 * @returns {object} Semantic operation descriptor
		 */
		var extractSemanticOperation = function (pQuery, pOperation)
		{
			var tmpParams = pQuery.parameters || {};
			var tmpRecord = tmpParams.record || null;
			var tmpScope = tmpParams.scope || '';
			var tmpIDField = tmpParams.IDField || ('ID' + tmpScope);

			// For Create/Update, the record data is in pQuery.query.records
			// or in pQuery.parameters.record
			if (!tmpRecord && pQuery.query && pQuery.query.records && pQuery.query.records.length > 0)
			{
				tmpRecord = pQuery.query.records[0];
			}

			var tmpSemanticOp = {
				entity: tmpScope,
				operation: pOperation,
				id: null,
				guid: null,
				record: tmpRecord,
				filters: tmpParams.filter || [],
				sort: tmpParams.sort || null,
				begin: tmpParams.begin || 0,
				cap: tmpParams.cap || 100,
				dataElements: tmpParams.dataElements || null,
				schema: (pQuery.query && pQuery.query.schema) || [],
				idField: tmpIDField
			};

			// Extract ID from filters if this is a single-record Read
			if (Array.isArray(tmpSemanticOp.filters))
			{
				for (var i = 0; i < tmpSemanticOp.filters.length; i++)
				{
					var tmpFilter = tmpSemanticOp.filters[i];
					if (tmpFilter.Column === tmpIDField && tmpFilter.Operator === '=')
					{
						tmpSemanticOp.id = tmpFilter.Value;
					}
					if (tmpFilter.Column === ('GUID' + tmpScope) && tmpFilter.Operator === '=')
					{
						tmpSemanticOp.guid = tmpFilter.Value;
					}
				}
			}

			return tmpSemanticOp;
		};

		/**
		 * Execute a semantic operation via the native bridge.
		 */
		var executeOperation = function (pSemanticOp, fCallback)
		{
			if (!_Bridge)
			{
				return fCallback(new Error('NativeBridge: No bridge function set. Call setBridge() first.'));
			}

			if (_Fable.log && _Fable.log.trace)
			{
				_Fable.log.trace('NativeBridge: ' + pSemanticOp.operation + ' ' + pSemanticOp.entity,
					{ id: pSemanticOp.id, filters: pSemanticOp.filters.length });
			}

			_Bridge(pSemanticOp,
				function (pError, pResult)
				{
					if (pError)
					{
						return fCallback(pError);
					}
					return fCallback(null, pResult || {});
				});
		};

		var Create = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			var tmpSemanticOp = extractSemanticOperation(pQuery, 'Create');

			executeOperation(tmpSemanticOp,
				function (pError, pNativeResult)
				{
					if (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					tmpResult.value = pNativeResult.lastInsertId || false;
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Read = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			var tmpSemanticOp = extractSemanticOperation(pQuery, 'Read');

			executeOperation(tmpSemanticOp,
				function (pError, pNativeResult)
				{
					if (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					tmpResult.value = pNativeResult.records || [];
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Update = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			var tmpSemanticOp = extractSemanticOperation(pQuery, 'Update');

			executeOperation(tmpSemanticOp,
				function (pError, pNativeResult)
				{
					if (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					// Meadow-Update.js checks typeof result.value === 'object'
					// to decide if the update succeeded.  Return an object that
					// mirrors what the MySQL provider produces.
					tmpResult.value = { affectedRows: pNativeResult.affectedRows || 0 };
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Delete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			var tmpSemanticOp = extractSemanticOperation(pQuery, 'Delete');

			executeOperation(tmpSemanticOp,
				function (pError, pNativeResult)
				{
					if (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					tmpResult.value = pNativeResult.affectedRows || 0;
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Undelete = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			var tmpSemanticOp = extractSemanticOperation(pQuery, 'Undelete');

			executeOperation(tmpSemanticOp,
				function (pError, pNativeResult)
				{
					if (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					tmpResult.value = pNativeResult.affectedRows || 0;
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var Count = function (pQuery, fCallback)
		{
			var tmpResult = pQuery.parameters.result;
			var tmpSemanticOp = extractSemanticOperation(pQuery, 'Count');

			executeOperation(tmpSemanticOp,
				function (pError, pNativeResult)
				{
					if (pError)
					{
						tmpResult.error = pError;
						tmpResult.value = false;
						tmpResult.executed = true;
						return fCallback();
					}

					tmpResult.error = null;
					tmpResult.value = pNativeResult.count || 0;
					tmpResult.executed = true;
					return fCallback();
				});
		};

		var tmpNewProvider = (
			{
				marshalRecordFromSourceToObject: marshalRecordFromSourceToObject,

				Create: Create,
				Read: Read,
				Update: Update,
				Delete: Delete,
				Undelete: Undelete,
				Count: Count,

				getProvider: getProvider,
				setBridge: setBridge,
				providerCreatesSupported: true,

				new: createNew
			});

		return tmpNewProvider;
	}

	return createNew();
};

module.exports = new MeadowProvider();
