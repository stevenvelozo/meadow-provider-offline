# DataCacheManager.dropTable

Drop a SQLite table. Removes the table and all its data from the in-memory database.

## Signature

```javascript
dataCacheManager.dropTable(pTableName, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pTableName` | string | Name of the table to drop |
| `fCallback` | function | Callback with signature `(pError)` |

**Returns:** nothing. Result delivered via callback.

## What It Does

Runs `DROP TABLE IF EXISTS <name>` against the in-memory sql.js database.

## Code Example

```javascript
tmpOffline.dataCacheManager.dropTable('Book', (pError) =>
{
    if (pError) return console.error(pError);
    console.log('Book table dropped');
});
```

## Typical Use With removeEntity

`provider.removeEntity(name)` **does not** drop the SQLite table -- it only unregisters the entity from the provider's registry and the interceptor. If you want full teardown, combine the two:

```javascript
tmpOffline.removeEntity('Book');
tmpOffline.dataCacheManager.dropTable('Book', (pError) =>
{
    if (pError) return console.error(pError);
    console.log('Book fully torn down');
});
```

Alternatively, use `resetTable(schema, callback)` which drops and re-creates in one step.

## Code Example: Logout

```javascript
function logoutAndWipe(pOffline)
{
    pOffline.disconnect();

    let tmpEntityNames = pOffline.entityNames.slice();

    let tmpIndex = 0;
    let tmpNext = () =>
    {
        if (tmpIndex >= tmpEntityNames.length)
        {
            pOffline.dirtyTracker.clearAll();
            return;
        }

        let tmpName = tmpEntityNames[tmpIndex++];
        pOffline.removeEntity(tmpName);
        pOffline.dataCacheManager.dropTable(tmpName, tmpNext);
    };
    tmpNext();
}
```

## Idempotency

Because the DROP statement uses `IF EXISTS`, dropping a table that doesn't exist is a silent no-op. You can call `dropTable` in cleanup code without worrying about whether the table was ever created.

## Related

- [createTable](api-createTable.md) -- create a new table
- [seedTable](api-seedTable.md) -- populate a table
- `resetTable(schema, callback)` -- drop and recreate in a single call
- [removeEntity](api-removeEntity.md) -- unregister an entity without dropping its table
