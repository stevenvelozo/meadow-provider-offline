# disconnect

Stop intercepting requests on a Fable `RestClient` and restore the original `executeJSONRequest` reference. After `disconnect()` returns, the RestClient behaves exactly as it did before `connect()` was ever called.

## Signature

```javascript
disconnect(pRestClient)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pRestClient` | object | *Optional.* The RestClient to disconnect. If not provided, disconnects whichever RestClient was previously connected. |

**Returns:** `true` if successfully disconnected, `false` otherwise.

## What It Does

1. Calls `RestClientInterceptor.disconnect(pRestClient)`, which:
2. Restores `RestClient.executeJSONRequest` to the original reference captured during `connect()`
3. Unwraps any binary interception hooks
4. Clears internal interceptor state

## Code Example: Basic Disconnect

```javascript
tmpOffline.connect(_Fable.RestClient);
// ... use the app offline ...
tmpOffline.disconnect(_Fable.RestClient);
// RestClient is now back to normal -- next call hits the network
```

## Code Example: Sync Flow

The canonical use for `disconnect()` is during sync. You disconnect, replay the dirty log against the real server, then reconnect:

```javascript
function syncAndReconnect(pOffline, pRestClient)
{
    // Stop intercepting -- all subsequent calls hit the real network
    pOffline.disconnect(pRestClient);

    // Replay dirty mutations
    syncDirtyRecords(pOffline, pRestClient, (pError) =>
    {
        if (pError)
        {
            console.error('Sync failed:', pError);
        }

        // Resume intercepting for future offline use
        pOffline.connect(pRestClient);
    });
}
```

This pattern is essential -- if you don't disconnect first, your sync calls will be caught by the interceptor and written back to SQLite instead of being sent to the server. Circular.

See [Sync Strategies](sync-strategies.md) for the full replay pattern.

## Code Example: Conditional Disconnect

Disconnect only if currently connected (useful in cleanup code):

```javascript
if (tmpOffline.restClientInterceptor && tmpOffline.restClientInterceptor.isConnected)
{
    tmpOffline.disconnect(_Fable.RestClient);
}
```

## Code Example: Disconnect on Teardown

```javascript
// When unmounting the offline module (e.g., during logout)
window.addEventListener('beforeunload', () =>
{
    if (tmpOffline)
    {
        tmpOffline.disconnect();
    }
});
```

## Implicit RestClient

Like `connect()`, you can omit the RestClient argument if you want the interceptor to use whichever RestClient it last remembered:

```javascript
tmpOffline.connect(_Fable.RestClient);
// ... later ...
tmpOffline.disconnect();  // disconnects the same RestClient
```

## Multiple RestClients

If you connected multiple RestClients (e.g., via the HeadlightRestClient second argument to `connect()`), you may need to disconnect each one explicitly. The interceptor tracks the primary RestClient as the one it was most recently asked to wrap; additional RestClients wrapped via `connectAdditionalRestClient()` are tracked separately.

In most apps, passing the original RestClient argument is enough -- HeadlightRestClient's internal restClient will also be unwrapped as part of the disconnect.

## Return Value

`disconnect()` returns a boolean indicating whether a disconnect actually happened:

```javascript
let tmpDisconnected = tmpOffline.disconnect(_Fable.RestClient);
console.log('Was connected:', tmpDisconnected);
```

Returns `false` if:
- The RestClient was never connected
- Internal interceptor state is inconsistent (rare)

## What Doesn't Get Restored

`disconnect()` restores the `executeJSONRequest` reference but does **not** touch:

- **SQLite data** -- remains in the `DataCacheManager`'s in-memory database
- **Dirty record log** -- `DirtyRecordTracker` keeps its mutations
- **Registered entities** -- still accessible via `getEntity(name)`
- **Blob store** -- still accessible via `provider.blobStore`
- **IPC Orator** -- still running; you can invoke it directly if you want

This is intentional. You might disconnect to sync, and then reconnect; during the disconnected window, the app may want to keep reading from SQLite via direct calls into `dataCacheManager` or `ipcOratorManager`.

If you want to fully tear down the provider, after `disconnect()` you would typically:

```javascript
tmpOffline.disconnect();
tmpOffline.dirtyTracker.clearAll();
// Drop any SQLite tables you want to discard
// Let the provider go out of scope
```

## Related

- [connect](api-connect.md) -- the inverse operation
- [Sync Strategies](sync-strategies.md) -- the canonical disconnect/sync/reconnect pattern
