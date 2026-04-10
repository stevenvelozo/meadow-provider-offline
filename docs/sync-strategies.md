# Sync Strategies

Meadow Provider Offline tracks every local mutation in an in-memory dirty-record log with intelligent coalescing. The provider **does not** sync data to the server on its own -- sync is an application concern, because every app has slightly different needs around conflict resolution, retries, and UX. This page documents the mechanics the tracker provides and the common replay patterns.

## The Dirty Record Log

Every mutation that flows through an intercepted meadow endpoint (Create, Update, Delete) is recorded in `provider.dirtyTracker`. The tracker stores:

```javascript
{
    entity: 'Book',
    id: 42,
    operation: 'create',      // 'create', 'update', or 'delete'
    record: { IDBook: 42, Title: '...' },
    timestamp: 1712345678901
}
```

Access the log via:

```javascript
provider.dirtyTracker.getDirtyMutations()              // all mutations
provider.dirtyTracker.getDirtyMutationsForEntity('Book') // per-entity
provider.dirtyTracker.getDirtyCount()                    // total count
provider.dirtyTracker.hasDirtyRecords()                  // boolean
provider.dirtyTracker.hasEntityDirtyRecords('Book')      // per-entity boolean
```

## Coalescing Rules

When a second mutation for the same `entity:id` key is tracked, the tracker applies these rules:

| Existing Op | New Op | Result |
|-------------|--------|--------|
| `create` | `delete` | **Remove from log** (record was never on the server) |
| `create` | `update` | **Replace as `create` with latest data** (sync as single Create) |
| `create` | `create` | Overwrite (shouldn't happen in practice) |
| `update` | `update` | Overwrite with latest data |
| `update` | `delete` | Overwrite as `delete` |
| `delete` | anything | Overwrite (shouldn't happen for a sane app) |

The two rules that actually matter are Create+Delete (no-op) and Create+Update (create-with-latest).

### Why Coalesce?

Without coalescing, a user who creates a new record and then deletes it before syncing would end up with two dirty entries (a Create and a Delete). When sync happens, the replay would POST the record, then DELETE it -- two round trips for nothing. With coalescing, the tracker notices the Create+Delete pair and removes both entries from the log. Zero round trips, zero wasted network.

Similarly, a user who creates a record, edits it three times, and then syncs should send a single POST with the final data -- not a POST followed by three PUTs. The Create+Update rule handles this.

## The Basic Sync Pattern

Replay the log against the real server when connectivity is restored:

```javascript
function syncDirtyRecords(pProvider, pRestClient, fCallback)
{
    let tmpTracker = pProvider.dirtyTracker;
    let tmpMutations = tmpTracker.getDirtyMutations();

    if (tmpMutations.length === 0)
    {
        return fCallback(null);
    }

    let tmpIndex = 0;
    let tmpErrors = [];

    let tmpNext = () =>
    {
        if (tmpIndex >= tmpMutations.length)
        {
            return fCallback(tmpErrors.length > 0 ? tmpErrors : null);
        }

        let tmpMutation = tmpMutations[tmpIndex++];
        syncOne(pProvider, pRestClient, tmpMutation, (pError) =>
        {
            if (pError) tmpErrors.push(pError);
            tmpNext();
        });
    };

    tmpNext();
}
```

The single-mutation handler dispatches on operation:

```javascript
function syncOne(pProvider, pRestClient, pMutation, fCallback)
{
    let tmpEntity = pProvider.getEntity(pMutation.entity);
    let tmpIDField = tmpEntity.schema.DefaultIdentifier;

    switch (pMutation.operation)
    {
    case 'create':
        pRestClient.postJSON(`/1.0/${pMutation.entity}`, pMutation.record,
            (pError, pResponse, pCreated) =>
            {
                if (pError) return fCallback(pError);

                // Clear the dirty entry
                pProvider.dirtyTracker.clearMutation(pMutation.entity, pMutation.id);

                // Remap negative ID to server-assigned ID
                if (pCreated && pCreated[tmpIDField] !== pMutation.id)
                {
                    pProvider.remapID(pMutation.entity, pMutation.id, pCreated[tmpIDField]);
                }

                return fCallback();
            });
        break;

    case 'update':
        pRestClient.putJSON(`/1.0/${pMutation.entity}`, pMutation.record,
            (pError) =>
            {
                if (!pError) pProvider.dirtyTracker.clearMutation(pMutation.entity, pMutation.id);
                return fCallback(pError);
            });
        break;

    case 'delete':
        pRestClient.deleteJSON(`/1.0/${pMutation.entity}/${pMutation.id}`,
            (pError) =>
            {
                if (!pError) pProvider.dirtyTracker.clearMutation(pMutation.entity, pMutation.id);
                return fCallback(pError);
            });
        break;
    }
}
```

**Critical detail:** Disconnect the provider before calling the sync function, or the interceptor will catch your sync calls and loop them back to SQLite instead of sending them to the server. The usual pattern is:

```javascript
pProvider.disconnect(pRestClient);
syncDirtyRecords(pProvider, pRestClient, (pError) =>
{
    pProvider.connect(pRestClient);  // Reconnect after sync
});
```

## Negative ID Remapping

When a record is created offline with a negative ID (via `enableNegativeIDs()`), the server will return a new positive ID on sync. The `remapID()` method updates the primary key on the record's own table **and** every foreign key reference across all registered entity tables:

```javascript
pProvider.remapID('Book', -3, 147);
// UPDATE Book SET IDBook = 147 WHERE IDBook = -3
// UPDATE BookAuthorJoin SET IDBook = 147 WHERE IDBook = -3
// UPDATE Review SET IDBook = 147 WHERE IDBook = -3
// UPDATE Cart SET IDBook = 147 WHERE IDBook = -3
// ... for every table with an IDBook column
```

This is what makes offline creates that reference each other work correctly. If the user creates two new books offline and then adds a review that references one of them, the negative IDs flow through the reference. On sync, the first book is POSTed and gets a real ID (say, 147). `remapID('Book', -3, 147)` updates every table's `IDBook` column. When the review is POSTed next, it already has the right ID.

The replay order matters: always sync Creates before Updates, and sync records in an order that respects foreign keys.

## Conflict Resolution

The tracker doesn't take a position on conflicts. If the server's version of a record has been updated since you went offline, your sync replay will overwrite it with the local version -- that may or may not be what you want. Common strategies:

### Last-Write-Wins

Just replay. Whoever synced most recently wins. This is the default if you use the basic pattern above.

### Server-Wins

Before replaying, fetch the server version and compare `UpdateDate`. If the server is newer, drop the local mutation:

```javascript
function syncUpdateWithConflictCheck(pProvider, pRestClient, pMutation, fCallback)
{
    let tmpEntity = pProvider.getEntity(pMutation.entity);
    let tmpIDField = tmpEntity.schema.DefaultIdentifier;

    pRestClient.getJSON(`/1.0/${pMutation.entity}/${pMutation.id}`,
        (pError, pResponse, pServerRecord) =>
        {
            if (pError) return fCallback(pError);

            let tmpLocalUpdate = new Date(pMutation.record.UpdateDate || pMutation.timestamp);
            let tmpServerUpdate = new Date(pServerRecord.UpdateDate || 0);

            if (tmpServerUpdate > tmpLocalUpdate)
            {
                // Server is newer -- drop the local mutation
                pProvider.dirtyTracker.clearMutation(pMutation.entity, pMutation.id);
                return fCallback();
            }

            // Local is newer -- replay
            pRestClient.putJSON(`/1.0/${pMutation.entity}`, pMutation.record,
                (pError) =>
                {
                    if (!pError) pProvider.dirtyTracker.clearMutation(pMutation.entity, pMutation.id);
                    return fCallback(pError);
                });
        });
}
```

### Three-Way Merge

Keep the original version (the record as it was when you went offline), the local mutation, and the server's current version. Merge field-by-field. This is the most user-friendly strategy but requires storing the "original" version somewhere -- typically by snapshotting `dataCacheManager` before going offline.

## Partial Sync

You can replay a single entity's mutations without touching others:

```javascript
let tmpBookMutations = pProvider.dirtyTracker.getDirtyMutationsForEntity('Book');
// ... replay each one
pProvider.dirtyTracker.clearEntity('Book');
```

Or clear the whole log after a successful wholesale sync:

```javascript
pProvider.dirtyTracker.clearAll();
```

## Persisting the Dirty Log Across Page Reloads

The tracker lives in memory. If the user refreshes the page before syncing, the log is lost (though the SQLite data in `DataCacheManager` persists for the duration of the session, since `sql.js` is in-memory too). For real offline-first apps you'll want to persist both:

```javascript
// Serialize before the user might refresh
window.addEventListener('beforeunload', () =>
{
    localStorage.setItem('dirty-log',
        JSON.stringify(provider.dirtyTracker.getDirtyMutations()));

    // For sql.js, call db.export() to get a Uint8Array of the whole DB
    let tmpDBBytes = provider.dataCacheManager.db.export();
    // Store tmpDBBytes somewhere (IndexedDB is the usual target)
});

// Restore on next load
let tmpSaved = localStorage.getItem('dirty-log');
if (tmpSaved)
{
    let tmpMutations = JSON.parse(tmpSaved);
    tmpMutations.forEach((pMutation) =>
        provider.dirtyTracker.trackMutation(
            pMutation.entity, pMutation.id, pMutation.operation, pMutation.record));
}
```

A future version of the provider may include built-in persistence, but this is application-owned territory for now because the persistence target (IndexedDB, localStorage, native storage) varies by platform.

## Binary Sync

Binary mutations (tracked via `trackBinaryMutation`) follow the same replay pattern but use `postBinary` instead of `postJSON`:

```javascript
let tmpBinaryMutations = provider.dirtyTracker.getBinaryMutations();
for (let tmpMutation of tmpBinaryMutations)
{
    provider.blobStore.getBlob(tmpMutation.blobKey, (pError, pBlobEntry) =>
    {
        pRestClient.postBinary(
            `/1.0/${tmpMutation.entity}/${tmpMutation.id}/Binary`,
            pBlobEntry.blob,
            pBlobEntry.metadata.mimeType,
            (pError) =>
            {
                if (!pError) provider.dirtyTracker.clearBinaryMutation(tmpMutation.entity, tmpMutation.id);
            });
    });
}
```

Remember: always disconnect before syncing binary data too, for the same reason.
