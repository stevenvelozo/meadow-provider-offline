# remapID

Remap a record's primary key from an old ID to a new ID, updating both the record itself and every foreign key reference to it across all registered entity tables. This is the critical operation that makes offline creates work correctly after sync: the server assigns a real positive ID, and `remapID` updates every table that referenced the old negative ID.

## Signature

```javascript
remapID(pEntityName, pOldID, pNewID)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntityName` | string | The entity whose primary key changed |
| `pOldID` | number or string | The old ID (typically negative from offline creates) |
| `pNewID` | number or string | The new ID (typically the positive ID the server assigned) |

**Returns:** `number` -- the total number of rows updated across all tables (the entity's own table plus all foreign key references found).

## What It Does

1. Verifies the entity is registered
2. Reads the primary key column name from the schema's `DefaultIdentifier`
3. Runs `UPDATE entity SET ID = newID WHERE ID = oldID` on the entity's own table
4. For every **other** registered entity, walks its columns looking for any whose name matches the primary key field of the target entity (e.g., `IDBook`)
5. For each match, runs `UPDATE otherEntity SET IDBook = newID WHERE IDBook = oldID`
6. Returns the total number of rows affected across all UPDATEs

## Code Example

```javascript
// Offline: create a book with ID -1
// Later: sync to server, server returns a real ID 4217
let tmpRowsUpdated = tmpOffline.remapID('Book', -1, 4217);
console.log('Updated', tmpRowsUpdated, 'rows across all tables');
// -> might be 5: 1 in Book, 3 in BookAuthorJoin, 1 in Review
```

## Code Example: Full Sync Replay

The canonical use -- integrated into a sync loop:

```javascript
function syncOne(pOffline, pRestClient, pMutation, fCallback)
{
    let tmpEntity = pOffline.getEntity(pMutation.entity);
    let tmpIDField = tmpEntity.schema.DefaultIdentifier;

    if (pMutation.operation === 'create')
    {
        pRestClient.postJSON(`/1.0/${pMutation.entity}`, pMutation.record,
            (pError, pRes, pCreated) =>
            {
                if (pError) return fCallback(pError);

                let tmpNewID = pCreated[tmpIDField];
                if (pMutation.id !== tmpNewID)
                {
                    console.log(`Remapping ${pMutation.entity} ${pMutation.id} -> ${tmpNewID}`);
                    let tmpRowsChanged = pOffline.remapID(pMutation.entity, pMutation.id, tmpNewID);
                    console.log(`  Updated ${tmpRowsChanged} rows`);
                }

                pOffline.dirtyTracker.clearMutation(pMutation.entity, pMutation.id);
                return fCallback();
            });
    }
    // ... update and delete handlers
}
```

The `pMutation.id !== tmpNewID` guard prevents needless work when the server returns the same ID you submitted (which happens if the create was already positive).

## How Foreign Key References Are Found

The method iterates over `this._Entities` and, for each entity, walks the `schema.Schema` array looking for columns whose name matches the primary key field of the target entity. For `Book` with `DefaultIdentifier: 'IDBook'`, it looks for columns named `IDBook` in every other entity's schema.

**This is a name-based match.** It relies on the meadow convention that foreign keys are named `ID<TargetEntity>`. If your schema uses a different naming convention (e.g., `AuthorIDBook` or `Book_ID`), `remapID` won't find those references and you'll have to update them manually.

## Code Example: Manual Foreign Key Update

If your schema doesn't follow the naming convention:

```javascript
tmpOffline.remapID('Book', -1, 4217);

// Also manually update your non-conventional foreign key columns
tmpOffline.dataCacheManager.db
    .prepare('UPDATE CustomTable SET NonConventionalBookRef = :newID WHERE NonConventionalBookRef = :oldID')
    .run({ newID: 4217, oldID: -1 });
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Entity not registered | Logs a warning, returns `0` |
| SQL error on primary update | Logs error, continues with foreign key updates |
| SQL error on foreign key update | Logs error for that table, continues to the next |
| Native bridge mode | **Not supported** -- logs an error and returns `0` |

The method is deliberately forgiving -- it tries to update as much as it can and reports the total rows affected. If you need strict error handling, call it inside a try/catch and inspect the logs.

## Native Bridge Limitation

`remapID` is **not supported** in native bridge mode. Because the provider can't inspect foreign key relationships across all tables through a single bridge call (and the bridge function may not have cross-table UPDATE capabilities), the native host must handle remapping itself.

If you're using a native bridge, implement your own remapping function on the native side and call it from the JavaScript sync replay loop via a special bridge operation:

```javascript
// In the sync handler
myNativeBridge(
    {
        sql: '__REMAP_ID__',
        parameters: { entity: 'Book', oldID: -1, newID: 4217 },
        operation: 'RemapID'
    },
    (pError) => { /* ... */ });
```

Then handle `'__REMAP_ID__'` inside your bridge function on the native side.

## Transactional Guarantees

The UPDATE statements are run sequentially, not in a single transaction. If a failure happens partway through, some tables will have been updated and others won't have been. In sql.js this is usually fine -- the failure modes are rare -- but if you need strict all-or-nothing semantics, wrap the call in a sql.js transaction manually:

```javascript
let tmpDb = tmpOffline.dataCacheManager.db;
tmpDb.exec('BEGIN TRANSACTION');
try
{
    let tmpCount = tmpOffline.remapID('Book', -1, 4217);
    tmpDb.exec('COMMIT');
}
catch (pError)
{
    tmpDb.exec('ROLLBACK');
    throw pError;
}
```

## Related

- [enableNegativeIDs](api-enableNegativeIDs.md) -- the feature that generates the negative IDs remapID is designed to clean up
- [getNextNegativeID](api-getNextNegativeID.md) -- how negative IDs are chosen initially
- [Sync Strategies § Negative ID Remapping](sync-strategies.md#negative-id-remapping)
