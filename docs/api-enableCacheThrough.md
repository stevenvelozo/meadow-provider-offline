# enableCacheThrough

Enable opportunistic caching of GET requests that fall through to the network. When enabled, any successful GET response (for an intercepted entity prefix) that came from the real network is ingested into SQLite before being handed back to the caller. Subsequent requests for the same records are served from SQLite without hitting the network.

## Signature

```javascript
enableCacheThrough()
disableCacheThrough()
```

No parameters, no return value, no callback.

## What It Does

`enableCacheThrough()` sets a cache-ingestion callback on the `RestClientInterceptor`. The callback is invoked whenever a GET request for a registered entity prefix falls through to the network (because the record wasn't in SQLite) and returns a successful response. The callback:

1. Filters out any records that have pending dirty mutations (the local version is authoritative)
2. Calls `dataCacheManager.ingestRecords(entityName, cleanRecords)` (an upsert, not a seed)
3. In native bridge mode: sends an `__INGEST_RECORDS__` operation to the bridge

`disableCacheThrough()` clears the callback.

## When to Use It

Cache-through lets you gradually transition from "online app" to "offline-capable app":

- **Online**: every GET hits the network normally and the response is silently cached
- **Going offline**: the cached records are already in SQLite; reads hit the cache instantly
- **Coming back online**: any dirty mutations are synced; reads can hit either the cache or the network

Without cache-through, you'd need to explicitly `seedEntity()` every entity before going offline. With cache-through, the app "warms" the cache as the user uses it.

## Code Example: Enabling at Startup

```javascript
tmpOffline.initializeAsync(() =>
{
    tmpOffline.addEntities([bookSchema, authorSchema, reviewSchema], () =>
    {
        tmpOffline.connect(_Fable.RestClient);
        tmpOffline.enableCacheThrough();

        // Now the app's normal GETs will cache into SQLite as they flow through
    });
});
```

## Code Example: The Fall-Through Flow

```javascript
tmpOffline.enableCacheThrough();

// First request -- record not in SQLite, falls through to network
_Fable.RestClient.getJSON('/1.0/Book/42', (pError, pRes, pBook) =>
{
    console.log(pBook);  // { IDBook: 42, Title: '...' } -- from network
    // At this point the book is ingested into SQLite behind the scenes
});

// Second request -- record now in SQLite, served locally
_Fable.RestClient.getJSON('/1.0/Book/42', (pError, pRes, pBook) =>
{
    console.log(pBook);  // Same data, but came from SQLite this time
});
```

Neither call looks different to the application. The provider handles the transparent caching.

## Safety Rule: Dirty Records Are Never Overwritten

The critical safety rule: **if a record has a pending dirty mutation, the network response is ignored**. Your local edits are authoritative until they sync. Without this rule, a fall-through GET could silently overwrite an unsynced local edit.

```javascript
// 1. User edits a record offline
_Fable.RestClient.putJSON('/1.0/Book', { IDBook: 42, Title: 'Edited Locally' }, () =>
{
    // Dirty tracker now has a mutation for Book:42

    // 2. A later GET for Book:42 falls through to the network
    _Fable.RestClient.getJSON('/1.0/Book/42', (pError, pRes, pBook) =>
    {
        // The network response is NOT cached because the local version is dirty
        // (the callback still receives the network response -- safety only
        // blocks the write to SQLite)
    });
});
```

## Disabling

```javascript
tmpOffline.disableCacheThrough();
```

After disabling, fall-through GETs still succeed (they hit the network as usual), but responses are no longer ingested into SQLite.

## Interaction with Native Bridge

Cache-through works in native bridge mode too. When a fall-through GET returns clean records, the provider sends an `__INGEST_RECORDS__` operation to the bridge:

```javascript
// In your native bridge function, handle the special operation:
function myNativeBridge(pQueryInfo, fCallback)
{
    if (pQueryInfo.sql === '__INGEST_RECORDS__')
    {
        let tmpEntity = pQueryInfo.parameters.entityName;
        let tmpRecords = pQueryInfo.parameters.records;
        // Upsert into native SQLite
        insertOrReplaceInNativeDB(tmpEntity, tmpRecords);
        return fCallback();
    }
    // ... normal SQL handling
}
```

See [Native Bridge](native-bridge.md) for the full bridge implementation.

## Related

- [Architecture § Cache-Through Flow](architecture.md#cache-through-flow) -- sequence diagram
- [DataCacheManager ingestRecords](api-ingestRecords.md) -- the underlying upsert method
- [connect](api-connect.md) -- must be called before cache-through can do anything
- [Concepts § Cache-Through](concepts.md#cache-through)
