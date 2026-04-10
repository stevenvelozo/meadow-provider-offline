# hasDirtyRecords / hasEntityDirtyRecords

Cheap boolean checks to test whether any mutations are pending. Two forms:

- `hasDirtyRecords()` -- any mutation for any entity
- `hasEntityDirtyRecords(pEntity)` -- any mutation for a specific entity

## Signatures

```javascript
tracker.hasDirtyRecords()               // -> boolean
tracker.hasEntityDirtyRecords(pEntity)  // -> boolean
```

## Code Example: Guard a Sync Call

```javascript
if (!tmpOffline.dirtyTracker.hasDirtyRecords())
{
    console.log('Nothing to sync');
    return;
}

startSync(tmpOffline, _Fable.RestClient);
```

## Code Example: Reactive UI Badge

```javascript
function updateSyncBadge()
{
    let tmpBadge = document.getElementById('sync-badge');
    if (tmpOffline.dirtyTracker.hasDirtyRecords())
    {
        tmpBadge.style.display = 'inline';
        tmpBadge.textContent = tmpOffline.dirtyTracker.getDirtyCount();
    }
    else
    {
        tmpBadge.style.display = 'none';
    }
}

// Call this after any mutation
updateSyncBadge();
```

## Code Example: Per-Entity Check

```javascript
let tmpEntities = tmpOffline.entityNames;
for (let tmpName of tmpEntities)
{
    if (tmpOffline.dirtyTracker.hasEntityDirtyRecords(tmpName))
    {
        console.log(`${tmpName} has pending changes`);
    }
}
```

## Implementation Note

`hasDirtyRecords()` is implemented as `this._mutations.length > 0` -- O(1) constant time. `hasEntityDirtyRecords()` runs `.some(...)` over the mutation array -- O(n) but usually negligible because dirty logs rarely contain more than a few hundred entries.

If you're calling `hasEntityDirtyRecords()` in a tight loop over many entities, prefer reading `getDirtyMutations()` once and grouping by entity name yourself.

## Binary Mutations

Neither of these methods checks for **binary** mutations. To check for binary mutations use:

```javascript
tmpOffline.dirtyTracker.hasBinaryMutations()       // -> boolean
tmpOffline.dirtyTracker.getBinaryDirtyCount()      // -> number
```

If you want a combined check:

```javascript
function hasAnyDirty(pTracker)
{
    return pTracker.hasDirtyRecords() || pTracker.hasBinaryMutations();
}
```

## Related

- [trackMutation](api-trackMutation.md) -- makes this method return `true`
- [clearMutation](api-clearMutation.md) / [clearAll](api-clearAll.md) -- make this method return `false`
- [getDirtyMutations](api-getDirtyMutations.md) -- get the mutation array for detailed inspection
