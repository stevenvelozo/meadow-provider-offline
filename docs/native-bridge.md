# Native Bridge

For applications running inside a native host (iOS WKWebView, Android WebView, Electron, Tauri), the browser `sql.js` WASM bundle is usually unnecessary overhead. The host already has SQLite -- the webview just needs a way to send queries to it. The **Native Bridge** replaces `DataCacheManager` / `sql.js` entirely with a user-supplied function that routes queries through the host.

The result: no WASM load, no duplicate database, single-threaded performance replaced by the host's native SQLite implementation.

## When to Use It

- **iOS apps** using WKWebView -- `sql.js` works but IndexedDB has historically been unreliable for blob persistence; a native bridge sidesteps both issues
- **Android apps** using WebView -- same story
- **Electron** or **Tauri** apps where you already have `better-sqlite3` or `rusqlite` on the Node / Rust side
- **Testing** -- a mock bridge can return canned responses without touching real SQLite

## When NOT to Use It

- Pure browser apps with no native host -- use the default `sql.js` path
- Apps where you want the offline database to survive across sessions in a single portable format -- `sql.js` lets you export the whole database as a `Uint8Array`; the native bridge by definition lives in the host

## Bridge Function Signature

A bridge function has this shape:

```javascript
/**
 * @param {object} pQueryInfo
 *   @property {string} sql -- The SQL statement with named parameters
 *   @property {object} parameters -- Named parameter bindings
 *   @property {string} operation -- 'Create' | 'Read' | 'Update' | 'Delete' | 'Count' | ...
 * @param {function(pError, pResult)} fCallback
 *   @property {Array} pResult.rows -- Array of row objects
 *   @property {number} pResult.lastInsertRowid -- For INSERT operations
 *   @property {number} pResult.changes -- For UPDATE / DELETE operations
 */
function nativeBridge(pQueryInfo, fCallback)
{
    // Route pQueryInfo to the native host
    // Call fCallback(null, { rows, lastInsertRowid, changes }) on success
    // Call fCallback(error) on failure
}
```

The provider passes this function every SQL query -- on every Create, Read, Update, Delete, and Count that flows through an intercepted endpoint.

## Installation

```javascript
const libFable = require('fable');
const libMeadowProviderOffline = require('meadow-provider-offline');

const _Fable = new libFable({ Product: 'MyApp', ProductVersion: '1.0.0' });

_Fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
    SessionDataSource: 'None',
    DefaultSessionObject: { UserID: 1, UserRole: 'User', LoggedIn: true }
});

// ============================================================
// KEY STEP: set the bridge BEFORE initializeAsync()
// ============================================================
tmpOffline.setNativeBridge(myNativeBridgeFunction);

tmpOffline.initializeAsync((pError) =>
{
    // DataCacheManager was NOT initialized -- sql.js skipped entirely
    // All queries will route through myNativeBridgeFunction
    if (pError) throw pError;

    tmpOffline.addEntity(bookSchema, () =>
    {
        tmpOffline.connect(_Fable.RestClient);
        // RestClient.getJSON('/1.0/Books/0/10') now:
        //   1. Intercepted
        //   2. Routed through Orator IPC
        //   3. Routed through meadow-endpoints
        //   4. Routed through myNativeBridgeFunction
        //   5. Native host returns rows
        //   6. Response flows back to the callback
    });
});
```

**Critical:** `setNativeBridge()` must be called **before** `initializeAsync()`. The provider checks for the bridge during initialization to decide whether to skip `DataCacheManager` creation. Calling it afterwards is a no-op and logs an error.

## Example: iOS WKWebView Bridge

On the Swift side:

```swift
class SQLiteWebMessageHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let sql = body["sql"] as? String,
              let parameters = body["parameters"] as? [String: Any],
              let callbackId = body["callbackId"] as? String else { return }

        do {
            let result = try sqliteDatabase.execute(sql: sql, parameters: parameters)
            let resultJSON = try JSONSerialization.data(withJSONObject: [
                "rows": result.rows,
                "lastInsertRowid": result.lastInsertRowid,
                "changes": result.changes
            ])
            let resultString = String(data: resultJSON, encoding: .utf8)!

            message.webView?.evaluateJavaScript(
                "window.handleNativeBridgeResponse('\(callbackId)', null, \(resultString))")
        } catch {
            message.webView?.evaluateJavaScript(
                "window.handleNativeBridgeResponse('\(callbackId)', '\(error.localizedDescription)', null)")
        }
    }
}
```

On the JavaScript side:

```javascript
// Store pending callbacks by ID
const pendingBridgeCallbacks = new Map();
let nextBridgeCallbackId = 0;

// Native host will call this when a query completes
window.handleNativeBridgeResponse = (callbackId, error, result) =>
{
    let tmpCallback = pendingBridgeCallbacks.get(callbackId);
    if (!tmpCallback) return;
    pendingBridgeCallbacks.delete(callbackId);

    if (error)
    {
        return tmpCallback(new Error(error), null);
    }
    return tmpCallback(null, result);
};

// The bridge function itself
function iosSQLiteBridge(pQueryInfo, fCallback)
{
    let tmpId = String(nextBridgeCallbackId++);
    pendingBridgeCallbacks.set(tmpId, fCallback);

    window.webkit.messageHandlers.sqlite.postMessage(
        {
            sql: pQueryInfo.sql,
            parameters: pQueryInfo.parameters,
            operation: pQueryInfo.operation,
            callbackId: tmpId
        });
}

// Wire it up
tmpOffline.setNativeBridge(iosSQLiteBridge);
tmpOffline.initializeAsync(() => { /* ... */ });
```

## Example: Electron Bridge with `better-sqlite3`

In the renderer process:

```javascript
// main.js (Node side via contextBridge)
const Database = require('better-sqlite3');
const db = new Database('offline.db');

window.electronBridge = {
    sqliteExecute: (queryInfo) =>
    {
        try
        {
            if (queryInfo.sql.trim().toUpperCase().startsWith('SELECT'))
            {
                let rows = db.prepare(queryInfo.sql).all(queryInfo.parameters);
                return { rows, lastInsertRowid: 0, changes: 0 };
            }
            else
            {
                let result = db.prepare(queryInfo.sql).run(queryInfo.parameters);
                return {
                    rows: [],
                    lastInsertRowid: Number(result.lastInsertRowid),
                    changes: result.changes
                };
            }
        }
        catch (error)
        {
            throw error;
        }
    }
};
```

In the webview:

```javascript
function electronSQLiteBridge(pQueryInfo, fCallback)
{
    try
    {
        let tmpResult = window.electronBridge.sqliteExecute(pQueryInfo);
        return fCallback(null, tmpResult);
    }
    catch (pError)
    {
        return fCallback(pError, null);
    }
}

tmpOffline.setNativeBridge(electronSQLiteBridge);
```

Synchronous bridges are fine -- the provider's callback-based API works with both sync and async execution models.

## Example: Test Fake

For tests you can provide a deterministic bridge that returns canned data:

```javascript
function createFakeBridge()
{
    let tmpBooks = [
        { IDBook: 1, Title: 'Test Book 1' },
        { IDBook: 2, Title: 'Test Book 2' }
    ];

    return (pQueryInfo, fCallback) =>
    {
        if (pQueryInfo.sql.includes('SELECT') && pQueryInfo.sql.includes('Book'))
        {
            return fCallback(null, { rows: tmpBooks, lastInsertRowid: 0, changes: 0 });
        }
        if (pQueryInfo.sql.includes('INSERT') && pQueryInfo.sql.includes('Book'))
        {
            let tmpNewID = tmpBooks.length + 1;
            tmpBooks.push({ IDBook: tmpNewID, Title: pQueryInfo.parameters.Title || '' });
            return fCallback(null, { rows: [], lastInsertRowid: tmpNewID, changes: 1 });
        }
        return fCallback(null, { rows: [], lastInsertRowid: 0, changes: 0 });
    };
}

tmpOffline.setNativeBridge(createFakeBridge());
```

## Interactions With Other Features

| Feature | Native Bridge Behavior |
|---------|------------------------|
| `addEntity()` | Skips `createTable` -- the native host is expected to manage the schema |
| `seedEntity()` | No-op -- native host owns the data |
| `injectRecords()` | No-op -- alias for seedEntity |
| `enableCacheThrough()` | Works -- ingestion sends a special `__INGEST_RECORDS__` operation to the bridge |
| `enableNegativeIDs()` | Works -- `getNextNegativeID` queries MIN(ID) via the bridge asynchronously |
| `remapID()` | **Not supported** in native bridge mode -- the native host must handle remapping itself |
| Binary / Blob storage | Independent -- use `setStorageDelegate()` on BlobStoreManager to bridge blob storage too |

## Setting a Blob Storage Delegate Alongside

If you're using the native bridge for SQL, you almost certainly want a delegate for blobs too. Both escape hatches are independent:

```javascript
// Before initializeAsync
tmpOffline.setNativeBridge(mySQLBridge);

// After instantiation, before initializeAsync
tmpOffline.blobStore.setStorageDelegate(
    {
        storeBlob: (key, data, metadata, cb) => { /* native store */ },
        getBlob: (key, cb) => { /* native get */ },
        deleteBlob: (key, cb) => { /* native delete */ },
        listBlobs: (prefix, cb) => { /* native list */ },
        clearAll: (cb) => { /* native clear */ }
    });

tmpOffline.initializeAsync(/* ... */);
```

See the [BlobStoreManager API Reference](api-setStorageDelegate.md) for the delegate interface.

## Debugging

Add logging inside your bridge function to see every query that flows through:

```javascript
function loggingBridge(pQueryInfo, fCallback)
{
    console.log('[SQL]', pQueryInfo.operation, pQueryInfo.sql);
    console.log('[SQL params]', pQueryInfo.parameters);

    realBridge(pQueryInfo, (pError, pResult) =>
    {
        if (pError)
        {
            console.error('[SQL error]', pError);
        }
        else
        {
            console.log('[SQL result]', pResult);
        }
        return fCallback(pError, pResult);
    });
}
```

This is the easiest way to understand what meadow-endpoints is asking the native host to do, especially during initial bring-up.
