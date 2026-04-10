# trackMutation

Record a local mutation (create, update, or delete) in the dirty record log with intelligent coalescing. Called automatically by the post-CRUD lifecycle behaviors `addEntity()` adds to each entity's meadow-endpoints -- you rarely call it yourself.

## Signature

```javascript
tracker.trackMutation(pEntity, pIDRecord, pOperation, pRecord)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntity` | string | Entity name, e.g. `'Book'` |
| `pIDRecord` | number or string | The record's primary key |
| `pOperation` | string | `'create'`, `'update'`, or `'delete'` |
| `pRecord` | object | The full record data at time of mutation (deep-cloned on store) |

**Returns:** nothing.

## Coalescing Rules

When a second mutation for the same `Entity:ID` key comes in:

| Existing | New | Result |
|----------|-----|--------|
| `create` | `delete` | Both removed from log (no-op, record never existed on server) |
| `create` | `update` | Replaced as `create` with the latest data |
| any other pair | -- | Overwrite with new mutation |

See [Sync Strategies § Coalescing Rules](sync-strategies.md#coalescing-rules) for the complete table.

## Code Example: Manual Tracking

In application code you almost never call `trackMutation` directly -- the post-CRUD behaviors do it for you. But you can call it manually to simulate mutations or to track something that happened outside the normal meadow pipeline:

```javascript
// A third-party library updated a record directly in SQLite without going
// through meadow -- manually notify the tracker so sync will see it
tmpOffline.dirtyTracker.trackMutation(
    'Book',
    42,
    'update',
    { IDBook: 42, Title: 'Changed By External Lib', PublicationYear: 2024 });
```

## Code Example: Observing Coalescing

```javascript
let tmpTracker = tmpOffline.dirtyTracker;

tmpTracker.trackMutation('Book', -1, 'create', { IDBook: -1, Title: 'First' });
console.log(tmpTracker.getDirtyCount()); // -> 1

tmpTracker.trackMutation('Book', -1, 'update', { IDBook: -1, Title: 'Edited' });
console.log(tmpTracker.getDirtyCount()); // -> 1 (coalesced as create)
console.log(tmpTracker.getDirtyMutations()[0].operation); // -> 'create'
console.log(tmpTracker.getDirtyMutations()[0].record.Title); // -> 'Edited'

tmpTracker.trackMutation('Book', -1, 'delete', { IDBook: -1 });
console.log(tmpTracker.getDirtyCount()); // -> 0 (create + delete = no-op)
```

## Record Deep-Cloning

The `pRecord` argument is deep-cloned via `JSON.parse(JSON.stringify(pRecord))` at track time. This means:

- The tracker stores a snapshot of the record state at that exact moment
- Subsequent mutations to the caller's `pRecord` object don't affect the tracker
- `Date` objects, functions, `undefined`, and other non-JSON values are lost

If your records contain non-JSON values (e.g., `Date` instances), the tracker will serialize them to strings. This is usually fine -- the sync replay layer just POSTs the record back, and meadow-endpoints re-parses ISO strings. But be aware.

## Timestamp

Each mutation gets a `timestamp: Date.now()` field when tracked. Use this for conflict resolution:

```javascript
let tmpMutations = tmpTracker.getDirtyMutations();
let tmpOldestMutation = tmpMutations.reduce((pA, pB) =>
    pA.timestamp < pB.timestamp ? pA : pB);
console.log('Oldest pending mutation:', tmpOldestMutation);
```

## Related

- [getDirtyMutations](api-getDirtyMutations.md) -- read back the tracked mutations
- [clearMutation](api-clearMutation.md) -- remove a mutation after successful sync
- [hasDirtyRecords](api-hasDirtyRecords.md) -- check whether any mutations are pending
- [trackBinaryMutation](api-trackBinaryMutation.md) -- the binary-data version
- [Sync Strategies § Coalescing Rules](sync-strategies.md#coalescing-rules)
