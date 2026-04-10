# clearMutation / clearEntity

Remove mutations from the dirty record log after they've been successfully synced.

- `clearMutation(pEntity, pID)` -- clear a single mutation
- `clearEntity(pEntity)` -- clear all mutations for an entity
- `clearAll()` -- see [clearAll](api-clearAll.md)

## Signatures

```javascript
tracker.clearMutation(pEntity, pIDRecord)
tracker.clearEntity(pEntity)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntity` | string | Entity name |
| `pIDRecord` | number or string | The record's primary key |

**Returns:** nothing.

## When to Call These

After successfully replaying a mutation against the real server during sync. Once the server has accepted the change, you want to remove the corresponding entry from the local log so the next sync doesn't try to send it again.

## Code Example: Clear After Single Sync

```javascript
function syncOneMutation(pOffline, pRestClient, pMutation, fCallback)
{
    let tmpEntity = pOffline.getEntity(pMutation.entity);

    pRestClient.postJSON(`/1.0/${pMutation.entity}`, pMutation.record,
        (pError, pResponse, pCreated) =>
        {
            if (pError)
            {
                return fCallback(pError);
            }

            // Success -- clear the mutation
            pOffline.dirtyTracker.clearMutation(pMutation.entity, pMutation.id);

            return fCallback();
        });
}
```

## Code Example: Clear Entity-Wide

After a wholesale re-seed from the server, clear all pending mutations for that entity since the server's version is now authoritative:

```javascript
function refreshBookEntity(pOffline, pRestClient, fCallback)
{
    pRestClient.getJSON('/1.0/Books/0/100000', (pError, pResponse, pBooks) =>
    {
        if (pError) return fCallback(pError);

        // Replace local cache with fresh server data
        pOffline.seedEntity('Book', pBooks, () =>
        {
            // Any local mutations are no longer valid -- clear them
            pOffline.dirtyTracker.clearEntity('Book');
            return fCallback();
        });
    });
}
```

## Code Example: Tolerating Failures

If a sync call fails, do **not** clear the mutation -- leave it in the log for the next retry:

```javascript
pRestClient.putJSON(`/1.0/${pMutation.entity}`, pMutation.record,
    (pError) =>
    {
        if (pError)
        {
            // Don't clear -- try again next time
            console.error('Sync failed, will retry:', pError);
            return;
        }

        pOffline.dirtyTracker.clearMutation(pMutation.entity, pMutation.id);
    });
```

## Code Example: Clearing by Index

If you want to iterate and clear as you go, take a snapshot first to avoid modifying the array you're iterating:

```javascript
let tmpSnapshot = tmpOffline.dirtyTracker.getDirtyMutations(); // snapshot
for (let tmpMutation of tmpSnapshot)
{
    // ... replay tmpMutation synchronously ...
    tmpOffline.dirtyTracker.clearMutation(tmpMutation.entity, tmpMutation.id);
}
```

The snapshot returned by `getDirtyMutations()` is a `.slice()` copy, so clearing mutations during iteration is safe.

## Dirty Map Rebuild

Both `clearMutation` and `clearEntity` trigger a rebuild of the internal `_dirtyMap` lookup table, which maps `"Entity:ID"` strings to indices in the mutation array. After a clear, the indices shift, so the map is rebuilt from scratch. This is O(n) in the size of the log but typically negligible.

## No-Op Safety

If the mutation you're trying to clear doesn't exist, both methods are silent no-ops:

```javascript
tmpOffline.dirtyTracker.clearMutation('Book', 99999); // <- doesn't exist
// No error, no warning, just does nothing
```

This is deliberate -- sync logic is often defensive, and double-clearing shouldn't cause errors.

## Related

- [trackMutation](api-trackMutation.md) -- the inverse operation
- [getDirtyMutations](api-getDirtyMutations.md) -- inspect what's in the log
- [clearAll](api-clearAll.md) -- clear everything including binary mutations
- [hasDirtyRecords](api-hasDirtyRecords.md) -- check if the log is empty
- [Sync Strategies § The Basic Sync Pattern](sync-strategies.md#the-basic-sync-pattern) -- full replay loop
