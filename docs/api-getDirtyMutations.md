# getDirtyMutations / getDirtyCount / getDirtyMutationsForEntity

Read the dirty record log. Three related methods:

- `getDirtyMutations()` -- all pending mutations as an array
- `getDirtyCount()` -- count only, no array allocation
- `getDirtyMutationsForEntity(pEntity)` -- mutations for a single entity

## Signatures

```javascript
tracker.getDirtyMutations()                        // -> DirtyMutation[]
tracker.getDirtyCount()                            // -> number
tracker.getDirtyMutationsForEntity(pEntity)        // -> DirtyMutation[]
```

All three are synchronous and free of side effects.

## Return Shape

`getDirtyMutations()` and `getDirtyMutationsForEntity()` return an array of:

```javascript
{
    entity: 'Book',
    id: 42,
    operation: 'create',           // 'create' | 'update' | 'delete'
    record: { IDBook: 42, Title: '...', ... },
    timestamp: 1712345678901
}
```

The returned array is a shallow copy of the internal log (via `.slice()`). Mutating the array you receive does not affect the tracker's internal state -- though mutating the `record` objects inside it would, because they're references to the internal deep-clones. Treat the output as read-only.

## Code Example: Iterate and Sync

```javascript
let tmpMutations = tmpOffline.dirtyTracker.getDirtyMutations();

for (let tmpMutation of tmpMutations)
{
    console.log(`${tmpMutation.operation} ${tmpMutation.entity}:${tmpMutation.id}`);
}
// Example:
//   create Book:-1
//   update Book:42
//   delete Author:99
```

## Code Example: Count Check

```javascript
if (tmpOffline.dirtyTracker.getDirtyCount() > 0)
{
    showSyncNotification('You have unsaved offline changes');
}
```

This is cheaper than calling `getDirtyMutations().length` because it doesn't allocate a new array.

## Code Example: Per-Entity Filtering

```javascript
let tmpBookMutations = tmpOffline.dirtyTracker.getDirtyMutationsForEntity('Book');
console.log(`${tmpBookMutations.length} book mutations pending`);

for (let tmpMutation of tmpBookMutations)
{
    // Handle book mutations specifically
}
```

Internally this runs a `.filter()` over the full mutation array. For apps with many entities, calling `getDirtyMutationsForEntity()` for each entity separately is less efficient than calling `getDirtyMutations()` once and grouping by entity yourself:

```javascript
let tmpAll = tmpOffline.dirtyTracker.getDirtyMutations();
let tmpByEntity = {};
for (let tmpMutation of tmpAll)
{
    if (!tmpByEntity[tmpMutation.entity]) tmpByEntity[tmpMutation.entity] = [];
    tmpByEntity[tmpMutation.entity].push(tmpMutation);
}
```

## Code Example: Building a Sync Status UI

```javascript
function buildSyncStatus(pOffline)
{
    let tmpMutations = pOffline.dirtyTracker.getDirtyMutations();

    let tmpByOperation = { create: 0, update: 0, delete: 0 };
    let tmpByEntity = {};
    let tmpOldestTimestamp = Infinity;

    for (let tmpMutation of tmpMutations)
    {
        tmpByOperation[tmpMutation.operation]++;
        tmpByEntity[tmpMutation.entity] = (tmpByEntity[tmpMutation.entity] || 0) + 1;
        tmpOldestTimestamp = Math.min(tmpOldestTimestamp, tmpMutation.timestamp);
    }

    return {
        total: tmpMutations.length,
        byOperation: tmpByOperation,
        byEntity: tmpByEntity,
        oldestTimestamp: tmpOldestTimestamp === Infinity ? null : new Date(tmpOldestTimestamp)
    };
}

console.log(buildSyncStatus(tmpOffline));
// {
//   total: 7,
//   byOperation: { create: 3, update: 2, delete: 2 },
//   byEntity: { Book: 4, Author: 3 },
//   oldestTimestamp: Date(...)
// }
```

## Ordering

Mutations are stored in insertion order (coalesced). When `trackMutation` replaces or removes entries, the rest of the array is shifted -- so the order you read them in is not strictly "oldest first" after coalescing has happened. If you need strict timestamp ordering, sort by `timestamp` yourself:

```javascript
let tmpSorted = tmpOffline.dirtyTracker.getDirtyMutations()
    .slice()
    .sort((pA, pB) => pA.timestamp - pB.timestamp);
```

## Related

- [trackMutation](api-trackMutation.md) -- adds entries to the log
- [clearMutation](api-clearMutation.md) -- removes entries after sync
- [hasDirtyRecords](api-hasDirtyRecords.md) -- cheap boolean check
- [Sync Strategies](sync-strategies.md) -- replay patterns
