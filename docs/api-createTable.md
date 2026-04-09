# DataCacheManager.createTable

Create a SQLite table from a Meadow package schema object. Called automatically by `provider.addEntity()`; you can call it directly when working with the `DataCacheManager` outside the normal flow (e.g., in tests or for ad-hoc schemas).

## Signature

```javascript
dataCacheManager.createTable(pPackageSchema, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pPackageSchema` | object | Meadow package schema with `Scope` and `Schema` fields |
| `fCallback` | function | Callback with signature `(pError)` |

**Returns:** nothing. Result delivered via callback.

## What It Does

1. Calls `convertPackageSchemaToTableSchema(pPackageSchema)` to translate meadow column types to SQL DDL types
2. Builds a `CREATE TABLE IF NOT EXISTS <Scope> (<columns>)` statement
3. Runs the DDL against the in-memory sql.js database
4. Calls the callback

Because of `IF NOT EXISTS`, calling `createTable` repeatedly with the same schema is idempotent at the SQL level.

## Code Example: Direct Usage

```javascript
const tmpCache = tmpOffline.dataCacheManager;

const mySchema =
    {
        Scope: 'Note',
        Schema:
            [
                { Column: 'IDNote', Type: 'AutoIdentity' },
                { Column: 'Title', Type: 'String' },
                { Column: 'Body', Type: 'Text' }
            ]
    };

tmpCache.createTable(mySchema, (pError) =>
{
    if (pError) return console.error(pError);
    console.log('Table created');

    // Insert directly via sql.js
    tmpCache.db.prepare('INSERT INTO Note (Title, Body) VALUES (:title, :body)').run(
        { ':title': 'First note', ':body': 'Hello world' });

    let tmpRows = tmpCache.db.prepare('SELECT * FROM Note').all();
    console.log(tmpRows);
});
```

## Code Example: Used Via provider.addEntity

This is what `provider.addEntity()` does internally:

```javascript
// Inside addEntity (simplified)
this._DataCacheManager.createTable(pSchema, (pError) =>
{
    if (pError) return fCallback(pError);
    // ... register routes, store entity ...
});
```

You almost never need to call `createTable` yourself. Use `provider.addEntity()` instead, which does the table creation **plus** DAL setup, endpoint creation, and interceptor registration.

## Column Type Mapping

The `convertPackageSchemaToTableSchema` step maps meadow package types to SQLite DDL types:

| Meadow Type | SQLite Type |
|-------------|-------------|
| `AutoIdentity` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `String` | `TEXT` |
| `Text` | `TEXT` |
| `Integer` | `INTEGER` |
| `Decimal` | `REAL` |
| `Boolean` | `INTEGER` |
| `DateTime` / `CreateDate` / `UpdateDate` / `DeleteDate` | `TEXT` |
| `CreateIDUser` / `UpdateIDUser` / `DeleteIDUser` | `INTEGER` |
| `Deleted` | `INTEGER` |
| Unknown | `TEXT` (safe default) |

See [Entity Schema § Column Types](entity-schema.md#column-types) for the full mapping.

## Related

- [dropTable](api-dropTable.md) — remove a table
- [seedTable](api-seedTable.md) — populate a table
- [addEntity](api-addEntity.md) — the normal caller of this method
- [Entity Schema](entity-schema.md) — format of `pPackageSchema`
