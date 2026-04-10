# setNativeBridge

Replace `sql.js` with a native SQLite bridge function. When a bridge is set, the provider routes all meadow query execution through the bridge instead of the in-memory `sql.js` database. This eliminates the WASM load entirely and lets native hosts (iOS WKWebView, Android WebView, Electron) use real SQLite.

## Signature

```javascript
setNativeBridge(pBridgeFunction)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pBridgeFunction` | function | A function with signature `(pQueryInfo, fCallback)` -- see below |

**Returns:** nothing.

## When to Call It

**Critical:** `setNativeBridge()` must be called **before** `initializeAsync()`. The provider checks for a bridge during initialization to decide whether to instantiate `DataCacheManager` / `sql.js`. Calling it after `initializeAsync()` is a no-op and logs an error.

```javascript
// Correct order
tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {});
tmpOffline.setNativeBridge(myBridge);        // <- Before init
tmpOffline.initializeAsync(() => { /* ... */ });

// Wrong order -- setNativeBridge is ignored
tmpOffline.initializeAsync(() => { /* ... */ });
tmpOffline.setNativeBridge(myBridge);        // <- Too late, logs error
```

## Bridge Function Signature

```javascript
/**
 * @param {object} pQueryInfo
 *   @property {string} sql          The SQL statement with named parameters (like `:name`)
 *   @property {object} parameters   Named parameter bindings
 *   @property {string} operation    'Create' | 'Read' | 'Update' | 'Delete' | 'Count' | ...
 *
 * @param {function(pError, pResult)} fCallback
 *   @property {Array}  pResult.rows            Array of row objects (for SELECT)
 *   @property {number} pResult.lastInsertRowid For INSERT operations
 *   @property {number} pResult.changes         For UPDATE/DELETE operations
 */
function bridgeFunction(pQueryInfo, fCallback) { /* ... */ }
```

The bridge function is called for every CRUD operation on every registered entity. Think of it as "the JavaScript-side SQLite adapter" that the provider's meadow DAL talks to instead of `sql.js`.

## Code Example: Basic Setup

```javascript
const libFable = require('fable');
const libMeadowProviderOffline = require('meadow-provider-offline');

const _Fable = new libFable({ Product: 'MyApp', ProductVersion: '1.0.0' });

_Fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);

const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
        SessionDataSource: 'None',
        DefaultSessionObject: { UserID: 1, UserRole: 'User', UserRoleIndex: 1, LoggedIn: true }
    });

// Bridge: forward queries to a native WebKit message handler
function myNativeBridge(pQueryInfo, fCallback)
{
    window.webkit.messageHandlers.sqlite.postMessage(
        {
            sql: pQueryInfo.sql,
            parameters: pQueryInfo.parameters,
            operation: pQueryInfo.operation,
            callbackId: registerPendingCallback(fCallback)
        });
}

tmpOffline.setNativeBridge(myNativeBridge);

tmpOffline.initializeAsync((pError) =>
{
    if (pError) throw pError;
    console.log('Native bridge mode:', tmpOffline.useNativeBridge); // -> true

    // Add entities -- createTable is skipped in bridge mode
    tmpOffline.addEntity(bookSchema, () =>
    {
        tmpOffline.connect(_Fable.RestClient);
        // All queries flow through myNativeBridge
    });
});
```

## Code Example: Synchronous better-sqlite3 Bridge (Electron)

```javascript
const Database = require('better-sqlite3');
const db = new Database('./offline.db');

function sqliteBridge(pQueryInfo, fCallback)
{
    try
    {
        let tmpStatement = db.prepare(pQueryInfo.sql);

        if (pQueryInfo.sql.trim().toUpperCase().startsWith('SELECT'))
        {
            let tmpRows = tmpStatement.all(pQueryInfo.parameters || {});
            return fCallback(null, { rows: tmpRows, lastInsertRowid: 0, changes: 0 });
        }

        let tmpResult = tmpStatement.run(pQueryInfo.parameters || {});
        return fCallback(null,
            {
                rows: [],
                lastInsertRowid: Number(tmpResult.lastInsertRowid),
                changes: tmpResult.changes
            });
    }
    catch (pError)
    {
        return fCallback(pError, null);
    }
}

tmpOffline.setNativeBridge(sqliteBridge);
tmpOffline.initializeAsync(() => { /* ... */ });
```

Synchronous bridges work fine -- the provider's callback-based API handles both sync and async equally well.

## Code Example: Test Fake

```javascript
function fakeBridge(pQueryInfo, fCallback)
{
    console.log('[BRIDGE]', pQueryInfo.operation, pQueryInfo.sql);
    return fCallback(null, { rows: [], lastInsertRowid: 0, changes: 0 });
}

tmpOffline.setNativeBridge(fakeBridge);
tmpOffline.initializeAsync(() =>
{
    tmpOffline.addEntity(bookSchema, () =>
    {
        tmpOffline.connect(_Fable.RestClient);

        // Every query logs but returns nothing
        _Fable.RestClient.getJSON('/1.0/Books/0/10', () => {});
    });
});
```

## What Gets Skipped in Bridge Mode

| Feature | Normal Mode | Bridge Mode |
|---------|-------------|-------------|
| sql.js WASM load | yes | **skipped** |
| DataCacheManager instantiation | yes | **skipped** |
| `addEntity` `createTable` step | yes | **skipped** (native host owns schema) |
| `seedEntity` | populates SQLite | **no-op** (returns success) |
| `injectRecords` | populates SQLite | **no-op** (returns success) |
| `remapID` | updates tables | **not supported** (logs error) |
| Cache-through ingestion | `ingestRecords` call | `__INGEST_RECORDS__` bridge op |
| `getNextNegativeID` | sync SQL query | **async bridge call** |

In bridge mode, the native host is responsible for creating tables, seeding data, and handling remapping. The provider assumes the native side knows what it's doing and just forwards queries.

## Validation

`setNativeBridge()` refuses to work in two cases:

| Scenario | Behavior |
|----------|----------|
| Argument is not a function | Logs error, returns without setting |
| `initializeAsync()` has already completed | Logs error, returns without setting |

Either case logs a clear message and leaves the provider in its previous state.

## After Setting

Once set, the native bridge function is:

- Stored on `provider._nativeBridgeFunction`
- Read by `initializeAsync()` to decide whether to create `DataCacheManager`
- Swapped onto each entity's DAL during `addEntity()` so that `Create`, `Read`, `Update`, `Delete`, `Undelete`, `Count`, and `marshalRecordFromSourceToObject` all route through the bridge
- Read directly by `cache-through` ingestion and `getNextNegativeID`

You can inspect whether bridge mode is active:

```javascript
if (tmpOffline.useNativeBridge)
{
    console.log('Running in native bridge mode');
}
```

## Related

- [Native Bridge](native-bridge.md) -- full walkthrough with iOS, Electron, and test examples
- [initializeAsync](api-initializeAsync.md) -- must be called after `setNativeBridge`
- [Configuration Reference § Native-Bridge Configuration](configuration.md#example-native-bridge-configuration)
