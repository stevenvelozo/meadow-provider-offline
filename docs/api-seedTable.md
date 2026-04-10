# DataCacheManager.seedTable

Clear a SQLite table and insert a fresh set of records. Called by `provider.seedEntity()`; use directly when working with the `DataCacheManager` outside the provider.

## Signature

```javascript
dataCacheManager.seedTable(pTableName, pRecords)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pTableName` | string | Name of the SQLite table |
| `pRecords` | array | Array of record objects matching the table schema |

**Returns:** nothing. Operates synchronously on the in-memory sql.js database.

## What It Does

1. Runs `DELETE FROM <table>` to clear existing rows
2. Iterates the records array, running `INSERT INTO <table> (...) VALUES (...)` for each

Operates inside a single sql.js transaction if possible (sql.js doesn't expose explicit transactions but commits the statements sequentially).

## Code Example: Direct Usage

```javascript
const tmpCache = tmpOffline.dataCacheManager;

tmpCache.seedTable('Book',
    [
        { IDBook: 1, Title: 'Book One', PublicationYear: 2020 },
        { IDBook: 2, Title: 'Book Two', PublicationYear: 2021 },
        { IDBook: 3, Title: 'Book Three', PublicationYear: 2022 }
    ]);

let tmpCount = tmpCache.db.prepare('SELECT COUNT(*) as count FROM Book').getAsObject({});
console.log('Rows in Book:', tmpCount.count);
// -> 3
```

## Code Example: Via provider.seedEntity

In normal application code, use `provider.seedEntity()` instead. It delegates to `seedTable()` internally and also handles the native bridge case (where the call is a no-op).

```javascript
tmpOffline.seedEntity('Book', bookRecords, (pError) =>
{
    if (pError) return console.error(pError);
    console.log('Seeded');
});
```

See [seedEntity](api-seedEntity.md).

## Seed vs Ingest

`seedTable` **replaces** all rows. If you want to upsert without clearing, use `ingestRecords` instead:

```javascript
// Replace
tmpCache.seedTable('Book', tmpNewRows);

// Upsert
tmpCache.ingestRecords('Book', tmpNewRows);
```

See [ingestRecords](api-ingestRecords.md) for the upsert semantics.

## Record Format

Records should be plain objects with keys matching the table's column names. Missing columns are inserted as `NULL`. Extra keys (not matching any column) are silently ignored.

```javascript
// Schema has columns: IDBook, Title, PublicationYear, Deleted
tmpCache.seedTable('Book', [
    { IDBook: 1, Title: 'Hello' }
    // PublicationYear and Deleted will be NULL
    // extraKey would be ignored
]);
```

## Related

- [seedEntity](api-seedEntity.md) -- the provider-level wrapper that calls this
- [ingestRecords](api-ingestRecords.md) -- upsert variant that doesn't clear
- [createTable](api-createTable.md) -- create the table before seeding it
- [clearTable](api-clearTable.md) -- just clear without seeding
