# enableNegativeIDs

Enable negative ID assignment for records created offline. When enabled, `POST` requests that would normally let SQLite auto-generate a positive ID instead get a unique negative ID, picked by querying `MIN(ID)` from the entity's table.

## Signature

```javascript
enableNegativeIDs()
disableNegativeIDs()
```

No parameters, no return value.

## Why Negative IDs

When the user is offline and creates new records, the local SQLite table needs to assign primary keys. There are two options:

1. **Let SQLite auto-increment positive IDs.** These may collide with server-assigned IDs when you sync — SQLite might give you ID 42, but the server might already have a record with ID 42 it never told you about.
2. **Use negative IDs.** Servers always return positive IDs, so negative IDs can never collide. On sync, the client remaps each negative ID to the real positive ID the server assigns (via [`remapID()`](api-remapID.md)).

Negative IDs are the safer choice and the conventional pattern in most offline-first apps. This module implements them as an opt-in feature.

## What It Does

`enableNegativeIDs()` flips an internal boolean (`_negativeIDsEnabled = true`). The flag is read by the Create-pre-operation lifecycle behavior that was added to each entity's endpoints during `addEntity()`. When the flag is true, that behavior:

1. Calls [`getNextNegativeID(entityName, ...)`](api-getNextNegativeID.md) to find the next available negative ID
2. Stamps it onto the record's `DefaultIdentifier` column before the SQL INSERT runs

`disableNegativeIDs()` clears the flag. Subsequent creates will use SQLite AUTOINCREMENT (positive IDs).

## Code Example

```javascript
tmpOffline.initializeAsync(() =>
{
    tmpOffline.addEntity(bookSchema, () =>
    {
        tmpOffline.connect(_Fable.RestClient);
        tmpOffline.enableNegativeIDs();

        // Any new book created now gets a negative ID
        _Fable.RestClient.postJSON('/1.0/Book', { Title: 'New Offline Book' },
            (pError, pRes, pCreated) =>
            {
                console.log('Created:', pCreated);
                // → { IDBook: -1, Title: 'New Offline Book', ... }
            });

        // Second create — next lower negative ID
        _Fable.RestClient.postJSON('/1.0/Book', { Title: 'Another Offline Book' },
            (pError, pRes, pCreated) =>
            {
                console.log('Created:', pCreated);
                // → { IDBook: -2, Title: 'Another Offline Book', ... }
            });
    });
});
```

## How "Next ID" Is Computed

For each new create, the provider runs:

```sql
SELECT MIN(IDField) AS minID FROM EntityTable
```

And computes:

```javascript
nextID = Math.min(minID, 0) - 1
```

Which means:

- Empty table or all-positive IDs → nextID = -1
- Table has `-3` as minimum → nextID = -4
- Table has `-1` as minimum → nextID = -2

This handles the case where negative-ID records persist across sessions — on reload, the next create picks up below the existing minimum, avoiding collisions with records created in a previous session.

## Cross-Session Persistence

Negative IDs are just regular primary keys from SQLite's perspective. They persist in the table just like positive IDs. If you export the sql.js database to IndexedDB and reload it later, the negative IDs come back and the next create continues numbering below them.

## Syncing Negative-ID Records

When you come back online and sync, the replay loop POSTs each dirty record. The server assigns a real positive ID and returns it in the response. You call [`remapID()`](api-remapID.md) to update the local primary key and every foreign key reference across all tables:

```javascript
// After POST succeeds
pRestClient.postJSON('/1.0/Book', tmpMutation.record,
    (pError, pRes, pCreated) =>
    {
        let tmpOldID = tmpMutation.id;      // e.g. -1
        let tmpNewID = pCreated.IDBook;     // e.g. 4217

        if (tmpOldID !== tmpNewID)
        {
            pOffline.remapID('Book', tmpOldID, tmpNewID);
            // Now IDBook=-1 is updated to 4217 everywhere
        }
    });
```

See [Sync Strategies § Negative ID Remapping](sync-strategies.md#negative-id-remapping) for the full replay pattern.

## Disabling

After disabling, subsequent creates will use SQLite AUTOINCREMENT (positive IDs). Already-created records keep their negative IDs:

```javascript
tmpOffline.enableNegativeIDs();
// create: IDBook = -1
// create: IDBook = -2

tmpOffline.disableNegativeIDs();
// create: IDBook = 1 (AUTOINCREMENT from the positive side)
```

Mixing is generally a bad idea — stick with one mode per session.

## Foreign Key References

If you create a record with a negative ID and then create a dependent record that references it, the foreign key will also be negative:

```javascript
// Book:-1 created offline
// BookAuthorJoin created referencing Book:-1
//   { IDBookAuthorJoin: -1, IDBook: -1, IDAuthor: 107 }
```

After sync, when `remapID('Book', -1, 4217)` runs, it updates `BookAuthorJoin.IDBook` in addition to `Book.IDBook`. The dependent record is automatically fixed up.

## Native Bridge Behavior

In native bridge mode, `enableNegativeIDs()` still works. The `getNextNegativeID` query goes through the bridge asynchronously:

```sql
SELECT MIN(IDBook) AS minID FROM Book
```

The bridge returns the result via its callback and the create proceeds with the computed negative ID.

`remapID()` is **not** supported in native bridge mode — the native host must handle remapping itself because the provider can't inspect foreign key relationships across all tables through a single bridge call.

## Related

- [getNextNegativeID](api-getNextNegativeID.md) — the query method that computes the next ID
- [remapID](api-remapID.md) — the remapping method used during sync
- [Sync Strategies § Negative ID Remapping](sync-strategies.md#negative-id-remapping) — full sync pattern
- [Concepts § Negative ID](concepts.md#negative-id)
