# initializeAsync

Initialize the offline provider. Sets up the SQLite database (or skips it when using native bridge), Orator IPC, and all sub-services. **Must be called before any other method.**

## Signature

```javascript
initializeAsync(fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `fCallback` | function | Node-style callback with signature `(pError)` |

**Returns:** nothing. Result delivered via callback.

## What It Does

1. If no native bridge is set: instantiates `DataCacheManager` and opens an in-memory SQLite database via `sql.js`
2. Instantiates `IPCOratorManager` and starts an in-process Orator IPC server with meadow-endpoints wiring
3. Instantiates `RestClientInterceptor`, `DirtyRecordTracker`, and `BlobStoreManager`
4. Applies session configuration (`_applySessionConfig`) -- writes `SessionDataSource` and `DefaultSessionObject` to `fable.settings`
5. Initializes `DataCacheManager` (async -- downloads sql.js WASM and opens the database)
6. Initializes `IPCOratorManager`
7. Initializes `BlobStoreManager` (opens IndexedDB, or skips if delegate set)
8. Sets `initialized = true` and calls the callback

## Code Example

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

tmpOffline.initializeAsync((pError) =>
{
    if (pError)
    {
        console.error('Failed to initialize offline provider:', pError);
        return;
    }

    console.log('Offline provider ready');
    console.log('Mode:', tmpOffline.useNativeBridge ? 'Native Bridge' : 'SQLite');

    // Now safe to call addEntity, connect, etc.
});
```

## Idempotency

Calling `initializeAsync()` when the provider is already initialized is a no-op. It logs a warning and calls the callback with no error:

```javascript
tmpOffline.initializeAsync(() =>
{
    // First call -- does the work
    tmpOffline.initializeAsync(() =>
    {
        // Second call -- warns "Already initialized" and calls back immediately
    });
});
```

## With a Native Bridge

If you call `setNativeBridge()` before `initializeAsync()`, the `DataCacheManager` / `sql.js` step is skipped entirely:

```javascript
tmpOffline.setNativeBridge(myNativeSQLiteBridge);

tmpOffline.initializeAsync((pError) =>
{
    // sql.js was never loaded -- all queries will route through the bridge
    console.log('Mode:', tmpOffline.useNativeBridge); // -> true
});
```

See [Native Bridge](native-bridge.md) for the full walkthrough.

## Error Cases

| Scenario | Outcome |
|----------|---------|
| `sql.js` WASM fails to load | `pError` = the sql.js loading error |
| IndexedDB fails to open | BlobStoreManager runs in degraded mode; no error |
| IPC Orator fails to start | `pError` = the Orator init error |

On any error, `initialized` remains `false` and no subsequent method will work.

## Promise Wrapper

For async/await flows:

```javascript
function initializeOffline(pOffline)
{
    return new Promise((resolve, reject) =>
    {
        pOffline.initializeAsync((pError) =>
        {
            if (pError) reject(pError);
            else resolve();
        });
    });
}

// Usage
await initializeOffline(tmpOffline);
tmpOffline.addEntity(bookSchema);
```

## Order of Operations

The initialization order is critical and cannot be changed:

```
Constructor
  ↓
setNativeBridge()  [optional, must be before initializeAsync]
  ↓
blobStore.setStorageDelegate()  [optional, must be before initializeAsync]
  ↓
initializeAsync()  [required]
  ↓
addEntity / addEntities  [creates DAL, endpoints, SQLite tables]
  ↓
connect()  [starts intercepting]
  ↓
seedEntity / normal RestClient usage
```

## Related

- [Configuration Reference](configuration.md) -- options that affect initialization
- [setNativeBridge](api-setNativeBridge.md) -- call this before `initializeAsync` to use native SQLite
- [connect](api-connect.md) -- the next step after initialization completes
