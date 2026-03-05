/**
 * Data-Cache-Manager - Manages the browser-side SQLite database for
 * offline data caching.
 *
 * Handles:
 *   - SQLite connection initialization (via meadow-connection-sqlite-browser)
 *   - Table creation from Meadow package schemas
 *   - Data seeding (bulk INSERT)
 *   - Table clearing and dropping
 *
 * Uses meadow-connection-sqlite-browser's schema provider for DDL generation,
 * converting Meadow package schema types to DDL-level DataTypes internally.
 *
 * @license MIT
 */
const libFableServiceBase = require('fable-serviceproviderbase');
const libMeadowConnectionSQLiteBrowser = require('meadow-connection-sqlite-browser');

/**
 * Map from Meadow package schema Type to DDL-level DataType.
 *
 * Meadow package objects use types like 'AutoIdentity', 'AutoGUID',
 * 'CreateDate', etc. The schema provider expects DDL-level types like
 * 'ID', 'GUID', 'DateTime', etc.
 *
 * @type {Record<string, string>}
 */
const MEADOW_TYPE_TO_DATA_TYPE = {
	'AutoIdentity': 'ID',
	'AutoGUID': 'GUID',
	'CreateDate': 'DateTime',
	'CreateIDUser': 'Numeric',
	'UpdateDate': 'DateTime',
	'UpdateIDUser': 'Numeric',
	'DeleteDate': 'DateTime',
	'DeleteIDUser': 'Numeric',
	'Deleted': 'Boolean',
	'Numeric': 'Numeric',
	'Integer': 'Numeric',
	'Decimal': 'Decimal',
	'String': 'String',
	'Text': 'Text',
	'DateTime': 'DateTime',
	'Boolean': 'Boolean',
	'JSON': 'JSON',
	'JSONProxy': 'JSONProxy',
	'ForeignKey': 'ForeignKey'
};

/**
 * @class DataCacheManager
 * @extends libFableServiceBase
 */
class DataCacheManager extends libFableServiceBase
{
	/**
	 * @param {object} pFable - The Fable instance
	 * @param {object} pOptions - Service options
	 * @param {string} pServiceHash - Service hash
	 */
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'DataCacheManager';

		/**
		 * The meadow-connection-sqlite-browser instance.
		 * @type {object|null}
		 */
		this._sqliteConnection = null;

		/**
		 * Whether the SQLite database is initialized and ready.
		 * @type {boolean}
		 */
		this.initialized = false;
	}

	/**
	 * Initialize the SQLite connection via meadow-connection-sqlite-browser.
	 *
	 * Registers the MeadowSQLiteProvider service with Fable, creates an
	 * in-memory SQLite database (via sql.js WASM), and wraps it with a
	 * better-sqlite3 compatible API.
	 *
	 * @param {function} fCallback - Callback with (pError)
	 */
	initializeAsync(fCallback)
	{
		let tmpSelf = this;

		if (this.initialized)
		{
			this.log.warn('DataCacheManager already initialized — skipping.');
			return fCallback();
		}

		// Register and instantiate the SQLite connection provider.
		// This makes it available as fable.MeadowSQLiteProvider.
		this.fable.serviceManager.addServiceType('MeadowSQLiteProvider', libMeadowConnectionSQLiteBrowser);
		this._sqliteConnection = this.fable.serviceManager.instantiateServiceProvider('MeadowSQLiteProvider');

		this._sqliteConnection.connectAsync(
			(pError) =>
			{
				if (pError)
				{
					tmpSelf.log.error('DataCacheManager: Failed to initialize SQLite connection', { Error: pError });
					return fCallback(pError);
				}

				tmpSelf.initialized = true;
				tmpSelf.log.info('DataCacheManager: In-memory SQLite database ready.');
				return fCallback();
			});
	}

	/**
	 * Get the meadow-connection-sqlite-browser instance.
	 *
	 * @returns {object|null}
	 */
	get sqliteConnection()
	{
		return this._sqliteConnection;
	}

	/**
	 * Get the better-sqlite3 compatible database wrapper.
	 *
	 * @returns {object|false}
	 */
	get db()
	{
		if (this._sqliteConnection)
		{
			return this._sqliteConnection.db;
		}
		return false;
	}

	/**
	 * Convert a Meadow package schema to the DDL-level table schema format
	 * expected by the schema provider.
	 *
	 * Meadow package format:
	 *   { Scope: "Book", Schema: [{ Column: "IDBook", Type: "AutoIdentity" }] }
	 *
	 * DDL-level format:
	 *   { TableName: "Book", Columns: [{ Column: "IDBook", DataType: "ID" }] }
	 *
	 * @param {object} pPackageSchema - Meadow package schema object
	 * @returns {object} DDL-level table schema
	 */
	convertPackageSchemaToTableSchema(pPackageSchema)
	{
		let tmpColumns = [];

		if (Array.isArray(pPackageSchema.Schema))
		{
			for (let i = 0; i < pPackageSchema.Schema.length; i++)
			{
				let tmpCol = pPackageSchema.Schema[i];
				let tmpDataType = MEADOW_TYPE_TO_DATA_TYPE[tmpCol.Type] || 'String';

				let tmpColumnDef = {
					Column: tmpCol.Column,
					DataType: tmpDataType
				};

				if (tmpCol.Size)
				{
					tmpColumnDef.Size = tmpCol.Size;
				}

				// Preserve StorageColumn for JSONProxy types
				if (tmpCol.Type === 'JSONProxy' && tmpCol.StorageColumn)
				{
					tmpColumnDef.StorageColumn = tmpCol.StorageColumn;
				}

				tmpColumns.push(tmpColumnDef);
			}
		}

		return {
			TableName: pPackageSchema.Scope,
			Columns: tmpColumns
		};
	}

	/**
	 * Create a SQLite table from a Meadow package schema.
	 *
	 * Uses the meadow-connection-sqlite-browser schema provider for
	 * DDL generation, converting package schema types automatically.
	 *
	 * @param {object} pPackageSchema - Meadow package schema object (with Scope and Schema)
	 * @param {function} fCallback - Callback with (pError)
	 */
	createTable(pPackageSchema, fCallback)
	{
		if (!this.initialized)
		{
			return fCallback(new Error('DataCacheManager: Not initialized. Call initializeAsync() first.'));
		}

		let tmpTableSchema = this.convertPackageSchemaToTableSchema(pPackageSchema);
		this._sqliteConnection.createTable(tmpTableSchema, fCallback);
	}

	/**
	 * Drop a SQLite table.
	 *
	 * @param {string} pTableName - The table name to drop
	 * @param {function} fCallback - Callback with (pError)
	 */
	dropTable(pTableName, fCallback)
	{
		if (!this.initialized)
		{
			return fCallback(new Error('DataCacheManager: Not initialized. Call initializeAsync() first.'));
		}

		try
		{
			let tmpSQL = this._sqliteConnection.generateDropTableStatement(pTableName);
			this._sqliteConnection.db.exec(tmpSQL);
			this.log.info(`DataCacheManager: Dropped table ${pTableName}`);
			return fCallback();
		}
		catch (pError)
		{
			this.log.error(`DataCacheManager: Error dropping table ${pTableName}`, { Error: pError });
			return fCallback(pError);
		}
	}

	/**
	 * Drop and recreate a table from a Meadow package schema.
	 *
	 * @param {object} pPackageSchema - Meadow package schema object
	 * @param {function} fCallback - Callback with (pError)
	 */
	resetTable(pPackageSchema, fCallback)
	{
		let tmpSelf = this;

		this.dropTable(pPackageSchema.Scope,
			(pDropError) =>
			{
				if (pDropError)
				{
					return fCallback(pDropError);
				}

				tmpSelf.createTable(pPackageSchema, fCallback);
			});
	}

	/**
	 * Clear all data from a table (DELETE FROM).
	 *
	 * @param {string} pTableName - The table name
	 */
	clearTable(pTableName)
	{
		if (!this.initialized)
		{
			this.log.error('DataCacheManager: Not initialized. Call initializeAsync() first.');
			return;
		}

		try
		{
			this._sqliteConnection.db.exec(`DELETE FROM ${pTableName}`);
			this.log.info(`DataCacheManager: Cleared table ${pTableName}`);
		}
		catch (pError)
		{
			this.log.error(`DataCacheManager: Error clearing table ${pTableName}`, { Error: pError });
		}
	}

	/**
	 * Seed a table with records.
	 *
	 * Uses the BetterSqlite3Compat layer from meadow-connection-sqlite-browser
	 * for INSERT operations (handles boolean coercion and named params).
	 *
	 * @param {string} pTableName - The table name
	 * @param {Array<object>} pRecords - Array of record objects
	 */
	seedTable(pTableName, pRecords)
	{
		if (!this.initialized)
		{
			this.log.error('DataCacheManager: Not initialized. Call initializeAsync() first.');
			return;
		}

		if (!Array.isArray(pRecords) || pRecords.length === 0)
		{
			this.log.info(`DataCacheManager: No records to seed for ${pTableName}`);
			return;
		}

		let tmpDb = this._sqliteConnection.db;

		// Clear any existing data
		tmpDb.exec(`DELETE FROM ${pTableName}`);

		// Build INSERT statement from the first record's columns
		let tmpColumns = Object.keys(pRecords[0]);
		let tmpColNames = tmpColumns.map((pCol) => '`' + pCol + '`').join(', ');
		let tmpPlaceholders = tmpColumns.map((pCol) => ':' + pCol).join(', ');
		let tmpSQL = `INSERT INTO ${pTableName} (${tmpColNames}) VALUES (${tmpPlaceholders})`;

		// BetterSqlite3Compat.run() handles boolean coercion automatically
		let tmpPrepared = tmpDb.prepare(tmpSQL);
		let tmpInsertedCount = 0;

		for (let i = 0; i < pRecords.length; i++)
		{
			let tmpBindParams = {};
			for (let j = 0; j < tmpColumns.length; j++)
			{
				let tmpVal = pRecords[i][tmpColumns[j]];
				if (typeof tmpVal === 'undefined')
				{
					tmpVal = null;
				}
				tmpBindParams[tmpColumns[j]] = tmpVal;
			}

			try
			{
				tmpPrepared.run(tmpBindParams);
				tmpInsertedCount++;
			}
			catch (pError)
			{
				this.log.error(`DataCacheManager: Error inserting record ${i} into ${pTableName}`, { Error: pError });
			}
		}

		this.log.info(`DataCacheManager: Seeded ${tmpInsertedCount} records into ${pTableName}`);
	}
}

// Explicitly set isFableService — class field inheritance can break in
// some browserify bundles when the parent module is a different copy.
DataCacheManager.isFableService = true;

module.exports = DataCacheManager;
module.exports.serviceType = 'DataCacheManager';
