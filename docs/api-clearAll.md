# clearAll

Remove every tracked mutation from the dirty log — both regular record mutations and binary mutations. Equivalent to a fresh `DirtyRecordTracker` state.

## Signature

```javascript
tracker.clearAll()
```

No parameters, no return value.

## What It Does

1. Empties `_mutations` array
2. Empties `_dirtyMap` lookup
3. Empties `_binaryMutations` array
4. Empties `_binaryDirtyMap` lookup

Both regular and binary dirty records are cleared in a single call.

## When to Call It

- **After a successful wholesale sync.** Once every mutation has been replayed against the real server and no errors remain, clear the whole log.
- **On logout.** When the user logs out, any pending mutations belonged to the previous user and should not carry over.
- **On reset / reinitialization.** If the app enters a state where the local cache is discarded, the dirty log should be discarded too.
- **In tests.** Clearing between tests gives a fresh state without reinstantiating the tracker.

## Code Example: After Successful Wholesale Sync

```javascript
function syncAll(pOffline, pRestClient, fCallback)
{
    pOffline.disconnect(pRestClient);

    replayAllMutations(pOffline, pRestClient, (pError) =>
    {
        if (pError)
        {
            // Leave dirty log intact for retry
            pOffline.connect(pRestClient);
            return fCallback(pError);
        }

        // All mutations synced successfully
        pOffline.dirtyTracker.clearAll();
        pOffline.connect(pRestClient);
        return fCallback();
    });
}
```

## Code Example: Logout Handler

```javascript
function logout(pOffline, pRestClient)
{
    // Stop intercepting
    pOffline.disconnect(pRestClient);

    // Clear the dirty log (the next user doesn't get the previous user's pending changes)
    pOffline.dirtyTracker.clearAll();

    // Clear all SQLite data
    for (let tmpName of pOffline.entityNames)
    {
        pOffline.dataCacheManager.clearTable(tmpName);
    }

    // Clear blob storage
    pOffline.blobStore.clearAll(() => { /* ... */ });

    // Redirect to login
    window.location.href = '/login';
}
```

## Code Example: Test Setup / Teardown

```javascript
describe('offline mode', () =>
{
    let tmpOffline;

    beforeEach((done) =>
    {
        tmpOffline = setupOffline();
        tmpOffline.initializeAsync(done);
    });

    afterEach(() =>
    {
        tmpOffline.dirtyTracker.clearAll();
    });

    it('tracks a create', (done) =>
    {
        tmpOffline.dirtyTracker.trackMutation('Book', 1, 'create', { IDBook: 1 });
        expect(tmpOffline.dirtyTracker.getDirtyCount()).toBe(1);
        done();
    });
});
```

## Doesn't Touch SQLite

`clearAll()` only clears the in-memory dirty log. It does **not** touch the SQLite database, the blob store, or any other state. If you want a full cache wipe, combine it with other operations:

```javascript
tmpOffline.dirtyTracker.clearAll();
for (let tmpName of tmpOffline.entityNames)
{
    tmpOffline.dataCacheManager.clearTable(tmpName);
}
tmpOffline.blobStore.clearAll(() => {});
```

## Partial Alternatives

If you want to clear only part of the log, use the more targeted methods:

- [`clearMutation(entity, id)`](api-clearMutation.md) — single mutation
- [`clearEntity(entity)`](api-clearMutation.md#entity-wide) — all mutations for one entity
- `clearBinaryMutation(entity, id)` — single binary mutation (see `trackBinaryMutation`)

## Related

- [trackMutation](api-trackMutation.md) — adds to the log
- [clearMutation](api-clearMutation.md) — clears a single entry
- [hasDirtyRecords](api-hasDirtyRecords.md) — always returns `false` immediately after `clearAll()`
