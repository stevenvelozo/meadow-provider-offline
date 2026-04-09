# trackBinaryMutation

Track a local binary (blob) mutation so it can be synced back to the server later. Called automatically by the binary interception layer when `postBinary` / `putBinary` requests are captured — you rarely call it directly.

## Signature

```javascript
tracker.trackBinaryMutation(pEntity, pIDRecord, pBlobKey, pMimeType)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntity` | string | Entity name, e.g. `'Artifact'` |
| `pIDRecord` | number or string | The record's primary key |
| `pBlobKey` | string | The key this blob is stored under in `BlobStoreManager` (e.g. `'Artifact:3:v1'`) |
| `pMimeType` | string | MIME type of the blob |

**Returns:** nothing.

## What It Does

1. Builds a binary mutation object: `{ entity, id, blobKey, mimeType, timestamp }`
2. Checks the internal `_binaryDirtyMap` for an existing entry for this `Entity:ID`
3. If there's already one, replaces it in place; otherwise appends
4. Updates the dirty map with the new index

Binary mutations don't coalesce the way regular mutations do — if you post a new blob for the same record twice, the second overwrites the first in the dirty log (pointing to the newer blob key).

## Code Example: Reading the Binary Dirty Log

```javascript
let tmpBinaryMutations = tmpOffline.dirtyTracker.getBinaryMutations();

for (let tmpMutation of tmpBinaryMutations)
{
    console.log(`${tmpMutation.entity}:${tmpMutation.id} → blob key ${tmpMutation.blobKey}`);
    // Artifact:3 → blob key Artifact:3:v1
}
```

## Code Example: Syncing Binary Mutations

```javascript
function syncBinary(pOffline, pRestClient, fCallback)
{
    let tmpMutations = pOffline.dirtyTracker.getBinaryMutations();
    let tmpIndex = 0;

    let tmpNext = () =>
    {
        if (tmpIndex >= tmpMutations.length) return fCallback();

        let tmpMutation = tmpMutations[tmpIndex++];

        pOffline.blobStore.getBlob(tmpMutation.blobKey, (pError, pEntry) =>
        {
            if (pError || !pEntry) return tmpNext(); // skip broken entries

            let tmpURL = `/1.0/${tmpMutation.entity}/${tmpMutation.id}/Binary`;
            pRestClient.postBinary(tmpURL, pEntry.blob, tmpMutation.mimeType,
                (pError) =>
                {
                    if (!pError)
                    {
                        pOffline.dirtyTracker.clearBinaryMutation(
                            tmpMutation.entity, tmpMutation.id);
                    }
                    tmpNext();
                });
        });
    };

    tmpNext();
}
```

As with regular mutations, always `disconnect()` the provider before running sync so the post calls go to the real network.

## Binary Helpers on the Tracker

| Method | Description |
|--------|-------------|
| `getBinaryMutations()` | Array of all pending binary mutations |
| `getBinaryMutationsForEntity(pEntity)` | Binary mutations for a single entity |
| `clearBinaryMutation(pEntity, pIDRecord)` | Clear a single binary mutation |
| `hasBinaryMutations()` | Boolean — any binary mutations pending |
| `getBinaryDirtyCount()` | Count of binary mutations |

These mirror the regular mutation helpers exactly.

## Relation to Regular Mutations

Binary mutations are tracked **separately** from regular record mutations. If you change a record's metadata (stored in SQLite) and upload a new blob (stored in IndexedDB), both are tracked:

```javascript
tmpTracker.getDirtyCount();        // → 1 (regular)
tmpTracker.getBinaryDirtyCount();  // → 1 (binary)
```

This separation is important because the sync calls are different — regular mutations use `postJSON` / `putJSON` / `deleteJSON`, and binary mutations use `postBinary`. Keeping them in separate lists lets you sync them independently or in whichever order your server expects.

## Storage Location

The binary data itself lives in `BlobStoreManager` (IndexedDB by default). The tracker only stores the key and metadata — it doesn't duplicate the blob bytes. To retrieve the actual blob during sync, call `provider.blobStore.getBlob(tmpMutation.blobKey, callback)`.

## Related

- [BlobStoreManager storeBlob](api-storeBlob.md) — where the actual blob bytes live
- [BlobStoreManager getBlob](api-getBlob.md) — retrieve the blob for sync
- [Architecture § Binary / Blob Lifecycle](architecture.md#binary--blob-lifecycle) — sequence diagram
- [Sync Strategies § Binary Sync](sync-strategies.md#binary-sync)
