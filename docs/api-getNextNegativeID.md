# getNextNegativeID

Query the next available negative ID for an entity by calling `SELECT MIN(IDField) FROM table` and returning `min(currentMin, 0) - 1`. Returns `-1` for empty tables or tables with all-positive IDs.

## Signature

```javascript
getNextNegativeID(pEntityName, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntityName` | string | The entity's `Scope` |
| `fCallback` | function | Callback with signature `(pError, pNextID)` |

**Returns:** nothing. Result delivered via callback.

## What It Does

1. Looks up the entity via `getEntity(pEntityName)`; if not registered, calls back with `-1`
2. Reads the primary key column name from the schema's `DefaultIdentifier`
3. If using native bridge: sends a `SELECT MIN(...)` via the bridge asynchronously
4. Otherwise: runs the query synchronously against the sql.js database
5. Computes `Math.min(currentMin, 0) - 1` and calls back with the result

## Code Example

```javascript
tmpOffline.getNextNegativeID('Book', (pError, pNextID) =>
{
    if (pError) return console.error(pError);
    console.log('Next book ID:', pNextID);
    // → -1 (empty table or all-positive)
    // → -5 (table has -4 as current minimum)
});
```

## When to Call It Manually

Most apps never call this directly — the Create-pre-operation behavior registered by `enableNegativeIDs()` calls it automatically for every new record. The only reasons to call it yourself:

### 1. Pre-Allocating IDs for a Related-Record Batch

If you're creating several related records in a single operation and want deterministic IDs for them:

```javascript
tmpOffline.getNextNegativeID('Book', (pError, pNextBookID) =>
{
    tmpOffline.getNextNegativeID('Author', (pError2, pNextAuthorID) =>
    {
        // Create the book with a specific ID
        _Fable.RestClient.postJSON('/1.0/Book',
            { IDBook: pNextBookID, Title: 'My Book' }, () =>
        {
            // Create the author
            _Fable.RestClient.postJSON('/1.0/Author',
                { IDAuthor: pNextAuthorID, Name: 'Me' }, () =>
            {
                // Create the join using the pre-allocated IDs
                _Fable.RestClient.postJSON('/1.0/BookAuthorJoin',
                    { IDBook: pNextBookID, IDAuthor: pNextAuthorID }, () =>
                {
                    // All three records are linked
                });
            });
        });
    });
});
```

Without this, you'd have to do the creates in strict order, reading back the generated IDs from each response.

### 2. Verifying Negative IDs Are Working

During development:

```javascript
tmpOffline.enableNegativeIDs();
tmpOffline.getNextNegativeID('Book', (pError, pNextID) =>
{
    console.log('If I create now, I will get ID:', pNextID);
});
```

### 3. Custom Create Flows

If you're bypassing the normal REST pipeline and calling the DAL directly, you need to pick an ID yourself:

```javascript
let tmpEntity = tmpOffline.getEntity('Book');

tmpOffline.getNextNegativeID('Book', (pError, pNextID) =>
{
    let tmpRecord = { IDBook: pNextID, Title: 'Direct DAL Create' };
    tmpEntity.dal.doCreate(tmpRecord, (pError, pQuery, pCreated) =>
    {
        console.log('Created:', pCreated);
    });
});
```

## Behavior When the Entity Isn't Registered

If `pEntityName` isn't a registered entity, the callback is called with `(null, -1)`. No error is raised. This is a safe default — it means "I don't know, so give it the default starting negative".

If you want stricter behavior, check registration yourself:

```javascript
if (!tmpOffline.getEntity('Book'))
{
    return console.error('Book is not registered');
}

tmpOffline.getNextNegativeID('Book', (pError, pNextID) => { /* ... */ });
```

## Sync / Async

In sql.js mode, the underlying SQL is synchronous — but `getNextNegativeID()` still uses a callback for consistency with the native bridge mode, where the query must be async.

You can always wrap in a promise:

```javascript
function getNextNegativeIDP(pOffline, pEntity)
{
    return new Promise((resolve, reject) =>
    {
        pOffline.getNextNegativeID(pEntity, (pError, pID) =>
        {
            if (pError) reject(pError);
            else resolve(pID);
        });
    });
}

let tmpNextID = await getNextNegativeIDP(tmpOffline, 'Book');
```

## Related

- [enableNegativeIDs](api-enableNegativeIDs.md) — enables automatic ID assignment; calls this internally
- [remapID](api-remapID.md) — converts negative IDs to real server IDs after sync
