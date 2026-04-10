# removeEntity

Unregister a previously-added entity. Removes its URL prefix from the interceptor and removes it from the entity registry.

## Signature

```javascript
removeEntity(pEntityName)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntityName` | string | The entity's `Scope` (name) |

**Returns:** nothing.

## What It Does NOT Do

**Important:** `removeEntity()` does **not** drop the SQLite table for the entity. The data remains in `DataCacheManager`'s database. If you want to also drop the table, call `provider.dataCacheManager.dropTable(pEntityName)` afterward.

This is deliberate. The separation lets you temporarily stop intercepting requests for an entity (to let them hit the network for a moment) while still preserving the local data for quick re-registration later.

## What It Does

1. Looks up the entity by name; logs a warning if not found
2. Unregisters the URL prefix (e.g., `/1.0/Book`) from the `RestClientInterceptor`
3. Deletes the entry from `provider._Entities`
4. Removes the name from `provider._EntityNames`

## Code Example

```javascript
// Register an entity
tmpOffline.addEntity(bookSchema, () =>
{
    console.log('After add:', tmpOffline.entityNames);
    // -> ['Book']

    // Unregister it
    tmpOffline.removeEntity('Book');
    console.log('After remove:', tmpOffline.entityNames);
    // -> []

    // Book's SQLite table still exists
    let tmpRows = tmpOffline.dataCacheManager.db.prepare('SELECT * FROM Book').all();
    console.log('Rows still in table:', tmpRows.length);
});
```

## Code Example: Full Teardown

To fully remove an entity, including its data:

```javascript
tmpOffline.removeEntity('Book');
tmpOffline.dataCacheManager.dropTable('Book', (pError) =>
{
    if (pError) console.error('Failed to drop Book table:', pError);
    else console.log('Book fully torn down');
});
```

## Code Example: Re-registering

After `removeEntity()`, you can call `addEntity()` again with the same schema -- the `CREATE TABLE IF NOT EXISTS` clause means the existing table is preserved:

```javascript
tmpOffline.removeEntity('Book');
// ... Book is no longer intercepted, but its table and data are still there ...

tmpOffline.addEntity(bookSchema, () =>
{
    // Book is registered again, with all the existing rows still in place
    let tmpCount = tmpOffline.dataCacheManager.db
        .prepare('SELECT COUNT(*) as count FROM Book')
        .getAsObject({});
    console.log('Row count after re-register:', tmpCount.count);
});
```

## Use Cases

- **Temporarily bypassing offline mode for a specific entity.** If you want one entity to always hit the network while other entities use the offline cache, remove it and let the interceptor forward requests for its prefix.
- **Hot-reloading schemas during development.** Remove and re-add with an updated schema. Note: if the schema's columns change, you'll need to drop the table manually before re-adding.
- **Tenant / customer isolation.** Remove all entities when the user logs out, add a fresh set for the new user.

## Errors

| Scenario | Behavior |
|----------|----------|
| Entity not registered | Logs a warning, returns silently |
| Interceptor not initialized | Logs an error |

No exceptions thrown. Safe to call multiple times.

## Related

- [addEntity](api-addEntity.md) -- the inverse operation
- [getEntity](api-getEntity.md) -- check whether an entity is currently registered
- [DataCacheManager dropTable](api-dropTable.md) -- drop the underlying SQLite table too
