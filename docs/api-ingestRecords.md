# DataCacheManager.ingestRecords

Upsert records into a table without clearing it first. For each record, runs `INSERT OR REPLACE` so existing rows with the same primary key get updated and new rows get inserted. This is the method the cache-through feature uses to populate SQLite from network responses.

## Signature

```javascript
dataCacheManager.ingestRecords(pTableName, pRecords)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pTableName` | string | Name of the SQLite table |
| `pRecords` | array | Array of record objects matching the table schema |

**Returns:** nothing. Operates synchronously on the in-memory sql.js database.

## Difference from seedTable

| Method | Behavior |
|--------|----------|
| `seedTable` | Clears the table first, then inserts |
| `ingestRecords` | Upserts without clearing |

Use `seedTable` when you have a complete snapshot of the data and want local to match it exactly. Use `ingestRecords` when you're adding or updating records without wanting to lose ones you haven't loaded yet.

## Code Example: Basic Usage

```javascript
tmpOffline.dataCacheManager.ingestRecords('Book',
    [
        { IDBook: 1, Title: 'Updated Title One' },  // already exists -- UPDATE
        { IDBook: 42, Title: 'Brand New' }           // doesn't exist -- INSERT
    ]);
```

Records that already have rows with matching primary keys get updated. Records without matching rows get inserted. Records not mentioned in the call are left alone.

## Code Example: Cache-Through (Internal Use)

This is what `enableCacheThrough()` does under the hood. When a fall-through GET returns records from the network, the provider's ingest callback filters out dirty records and calls this method:

```javascript
// Inside the cache-through callback (simplified)
tmpRestClientInterceptor.setCacheIngestCallback(
    (pEntityName, pData) =>
    {
        let tmpRecords = Array.isArray(pData) ? pData : [pData];

        // Filter out records that have pending dirty mutations
        let tmpCleanRecords = tmpRecords.filter(
            (pRec) => !tmpDirtyTracker._dirtyMap.hasOwnProperty(`${pEntityName}:${pRec[tmpIDField]}`));

        // Upsert the clean records
        if (tmpCleanRecords.length > 0)
        {
            tmpDataCacheManager.ingestRecords(pEntityName, tmpCleanRecords);
        }
    });
```

## Code Example: Manual Incremental Sync

You can also use `ingestRecords` manually to pull updates from the server without clearing the local cache:

```javascript
function pullUpdatesSince(pOffline, pRestClient, pEntityName, pSince)
{
    let tmpFilter = `FBV~UpdateDate~GT~"${pSince.toISOString()}"`;
    let tmpURL = `/1.0/${pEntityName}s/FilteredTo/${tmpFilter}/0/10000`;

    // Disconnect first so this GET hits the real network
    pOffline.disconnect();

    pRestClient.getJSON(tmpURL, (pError, pRes, pRecords) =>
    {
        if (pError)
        {
            pOffline.connect();
            return;
        }

        // Upsert -- this preserves records we already have
        pOffline.dataCacheManager.ingestRecords(pEntityName, pRecords);

        pOffline.connect();
        console.log(`Ingested ${pRecords.length} updated ${pEntityName} records`);
    });
}

// Pull books updated since 1 hour ago
pullUpdatesSince(tmpOffline, _Fable.RestClient, 'Book', new Date(Date.now() - 3600000));
```

## Implementation Details

For each record, `ingestRecords` runs an `INSERT OR REPLACE INTO <table> (...) VALUES (...)` statement. SQLite's `INSERT OR REPLACE` behavior:

- If a row with the same primary key exists, it's deleted and replaced with the new row
- If no row exists, a new row is inserted
- Any triggers or foreign key cascades fire as they would for a DELETE followed by an INSERT

Because this is a full row replacement (not a partial update), every column in the record object is written. Missing columns become `NULL`. If you want to update only specific columns without overwriting the others, use `provider.getEntity(name).dal.doUpdate(...)` via meadow directly.

## Dirty Record Safety

`ingestRecords` **does not** check whether records are dirty. It's a lower-level primitive that trusts the caller to handle that. `enableCacheThrough()` filters dirty records before calling `ingestRecords`, but if you call `ingestRecords` directly you need to do that filtering yourself:

```javascript
let tmpFiltered = pRecords.filter((pRec) =>
    !tmpOffline.dirtyTracker._dirtyMap.hasOwnProperty(`${pEntityName}:${pRec.IDBook}`));
tmpOffline.dataCacheManager.ingestRecords(pEntityName, tmpFiltered);
```

Otherwise you risk clobbering an unsynced local edit with stale server data.

## Related

- [seedTable](api-seedTable.md) -- the clear-and-insert variant
- [enableCacheThrough](api-enableCacheThrough.md) -- uses this method internally
- [seedEntity](api-seedEntity.md) -- the provider-level wrapper around `seedTable`
