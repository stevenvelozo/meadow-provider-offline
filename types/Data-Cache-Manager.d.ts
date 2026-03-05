export = DataCacheManager;
/**
 * @class DataCacheManager
 * @extends libFableServiceBase
 */
declare class DataCacheManager extends libFableServiceBase {
    /**
     * @param {object} pFable - The Fable instance
     * @param {object} pOptions - Service options
     * @param {string} pServiceHash - Service hash
     */
    constructor(pFable: object, pOptions: object, pServiceHash: string);
    /**
     * The meadow-connection-sqlite-browser instance.
     * @type {object|null}
     */
    _sqliteConnection: object | null;
    /**
     * Whether the SQLite database is initialized and ready.
     * @type {boolean}
     */
    initialized: boolean;
    /**
     * Initialize the SQLite connection via meadow-connection-sqlite-browser.
     *
     * Registers the MeadowSQLiteProvider service with Fable, creates an
     * in-memory SQLite database (via sql.js WASM), and wraps it with a
     * better-sqlite3 compatible API.
     *
     * @param {function} fCallback - Callback with (pError)
     */
    initializeAsync(fCallback: Function): any;
    /**
     * Get the meadow-connection-sqlite-browser instance.
     *
     * @returns {object|null}
     */
    get sqliteConnection(): object | null;
    /**
     * Get the better-sqlite3 compatible database wrapper.
     *
     * @returns {object|false}
     */
    get db(): object | false;
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
    convertPackageSchemaToTableSchema(pPackageSchema: object): object;
    /**
     * Create a SQLite table from a Meadow package schema.
     *
     * Uses the meadow-connection-sqlite-browser schema provider for
     * DDL generation, converting package schema types automatically.
     *
     * @param {object} pPackageSchema - Meadow package schema object (with Scope and Schema)
     * @param {function} fCallback - Callback with (pError)
     */
    createTable(pPackageSchema: object, fCallback: Function): any;
    /**
     * Drop a SQLite table.
     *
     * @param {string} pTableName - The table name to drop
     * @param {function} fCallback - Callback with (pError)
     */
    dropTable(pTableName: string, fCallback: Function): any;
    /**
     * Drop and recreate a table from a Meadow package schema.
     *
     * @param {object} pPackageSchema - Meadow package schema object
     * @param {function} fCallback - Callback with (pError)
     */
    resetTable(pPackageSchema: object, fCallback: Function): void;
    /**
     * Clear all data from a table (DELETE FROM).
     *
     * @param {string} pTableName - The table name
     */
    clearTable(pTableName: string): void;
    /**
     * Seed a table with records.
     *
     * Uses the BetterSqlite3Compat layer from meadow-connection-sqlite-browser
     * for INSERT operations (handles boolean coercion and named params).
     *
     * @param {string} pTableName - The table name
     * @param {Array<object>} pRecords - Array of record objects
     */
    seedTable(pTableName: string, pRecords: Array<object>): void;
}
declare namespace DataCacheManager {
    export { isFableService, serviceType };
}
import libFableServiceBase = require("fable-serviceproviderbase");
declare var isFableService: boolean;
declare const serviceType: "DataCacheManager";
//# sourceMappingURL=Data-Cache-Manager.d.ts.map