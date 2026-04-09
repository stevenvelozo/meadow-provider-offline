# seedEntity

Clear an entity's SQLite table and insert a fresh set of records. Use this to bulk-load data into the offline cache — typically from a server response fetched while the app was still online.

## Signature

```javascript
seedEntity(pEntityName, pRecords, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntityName` | string | The entity's `Scope` (must already be registered via `addEntity`) |
| `pRecords` | array | Array of record objects matching the entity's schema |
| `fCallback` | function | *Optional.* Callback with signature `(pError)` |

**Returns:** nothing. Result delivered via callback.

## What It Does

1. Verifies the entity is registered (errors out if not)
2. If using native bridge: no-op (the native host owns the data)
3. Otherwise: calls `dataCacheManager.seedTable(entityName, records)`, which:
   - Deletes all existing rows in the table
   - Inserts every record in a single transaction
4. Calls the callback

## Code Example: Basic Usage

```javascript
const bookRecords =
    [
        { IDBook: 1, Title: 'Breakfast of Champions', PublicationYear: 1973 },
        { IDBook: 2, Title: 'Cat\'s Cradle', PublicationYear: 1963 },
        { IDBook: 3, Title: 'Slaughterhouse-Five', PublicationYear: 1969 }
    ];

tmpOffline.addEntity(bookSchema, () =>
{
    tmpOffline.seedEntity('Book', bookRecords, (pError) =>
    {
        if (pError) return console.error(pError);

        // Verify the seed worked
        let tmpCount = tmpOffline.dataCacheManager.db
            .prepare('SELECT COUNT(*) as count FROM Book')
            .getAsObject({});
        console.log('Seeded', tmpCount.count, 'books');
        // → Seeded 3 books
    });
});
```

## Code Example: Fetching from Server Before Going Offline

The classic use case — pull a snapshot from the real server while still online, seed it into SQLite, then disconnect and let the app use the cached data:

```javascript
function seedFromServer(pOffline, pRestClient, pEntityName, fCallback)
{
    pRestClient.getJSON(`/1.0/${pEntityName}s/0/100000`,
        (pError, pResponse, pRecords) =>
        {
            if (pError) return fCallback(pError);

            pOffline.seedEntity(pEntityName, pRecords, (pSeedError) =>
            {
                if (pSeedError) return fCallback(pSeedError);
                console.log(`Seeded ${pRecords.length} ${pEntityName} records`);
                return fCallback();
            });
        });
}

// Pull books, authors, and reviews before going offline
seedFromServer(tmpOffline, _Fable.RestClient, 'Book', () =>
{
    seedFromServer(tmpOffline, _Fable.RestClient, 'Author', () =>
    {
        seedFromServer(tmpOffline, _Fable.RestClient, 'Review', () =>
        {
            tmpOffline.connect(_Fable.RestClient);
            // Now the app can go offline — all data is locally cached
        });
    });
});
```

**Important:** make sure you seed **before** calling `connect()`, or your seed `RestClient.getJSON()` calls will themselves be intercepted and return empty results from the (still empty) SQLite table.

## Code Example: Seeding Multiple Entities

Often you seed several entities in a row. Sequential with a simple chain:

```javascript
tmpOffline.seedEntity('Book', bookRecords, () =>
{
    tmpOffline.seedEntity('Author', authorRecords, () =>
    {
        tmpOffline.seedEntity('Review', reviewRecords, () =>
        {
            console.log('All entities seeded');
        });
    });
});
```

Or with a simple loop helper:

```javascript
function seedAll(pOffline, pSeeds, fCallback)
{
    let tmpIndex = 0;
    let tmpKeys = Object.keys(pSeeds);
    let tmpNext = () =>
    {
        if (tmpIndex >= tmpKeys.length) return fCallback();
        let tmpName = tmpKeys[tmpIndex++];
        pOffline.seedEntity(tmpName, pSeeds[tmpName], tmpNext);
    };
    tmpNext();
}

seedAll(tmpOffline,
    {
        Book: bookRecords,
        Author: authorRecords,
        Review: reviewRecords
    },
    () => console.log('Done'));
```

## Seed vs Ingest

`seedEntity` **replaces** all existing rows. If you want to upsert records (insert new ones, update existing ones in place, without clearing) use `dataCacheManager.ingestRecords()` directly:

```javascript
// Replace all books
tmpOffline.seedEntity('Book', bookRecords);

// Upsert without clearing
tmpOffline.dataCacheManager.ingestRecords('Book', bookRecords);
```

Cache-through mode uses `ingestRecords()` internally for exactly this reason — you don't want a stray cache refresh to wipe out records that haven't been fetched yet.

## Native Bridge Behavior

In native bridge mode, `seedEntity()` is a no-op and returns success immediately. The native app is expected to manage its own data — the provider assumes the native host knows how to populate SQLite from whatever source it uses.

If you need to populate data in native bridge mode, send a seed command through the bridge itself:

```javascript
myNativeBridge(
    { sql: '__SEED__', parameters: { entity: 'Book', records: bookRecords }, operation: 'Seed' },
    (pError) => { /* ... */ });
```

## Errors

| Scenario | Behavior |
|----------|----------|
| Entity not registered | Callback receives an Error |
| SQL failure during insert | Callback receives the SQL error (from seedTable) |
| `pRecords` is not an array | seedTable handles it gracefully (skips) |

## Related

- [injectRecords](api-injectRecords.md) — alias for `seedEntity` (semantic clarity)
- [addEntity](api-addEntity.md) — must be called first
- [DataCacheManager seedTable](api-seedTable.md) — the underlying method that does the work
- [DataCacheManager ingestRecords](api-ingestRecords.md) — upsert without clearing
