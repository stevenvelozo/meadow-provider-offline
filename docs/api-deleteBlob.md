# BlobStoreManager.deleteBlob

Delete a specific blob from storage by key. Also revokes any Object URL that was created for that blob via `getBlobURL`.

## Signature

```javascript
blobStore.deleteBlob(pKey, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pKey` | string | The blob's storage key |
| `fCallback` | function | Callback with signature `(pError)` |

**Returns:** nothing. Result delivered via callback.

## Code Example

```javascript
tmpOffline.blobStore.deleteBlob('Artifact:3:v1', (pError) =>
{
    if (pError) return console.error(pError);
    console.log('Blob deleted');
});
```

## Code Example: Delete All Versions of an Artifact

```javascript
tmpOffline.blobStore.listBlobs('Artifact:3:', (pError, pEntries) =>
{
    if (pError || !pEntries) return;

    let tmpIndex = 0;
    let tmpNext = () =>
    {
        if (tmpIndex >= pEntries.length)
        {
            console.log(`Deleted ${pEntries.length} blobs`);
            return;
        }

        tmpOffline.blobStore.deleteBlob(pEntries[tmpIndex++].key, tmpNext);
    };
    tmpNext();
});
```

## Code Example: Clean Up After Sync

After successfully syncing a binary mutation to the server, you may want to delete the local blob to free storage:

```javascript
function syncOneBinaryAndClean(pOffline, pRestClient, pMutation, fCallback)
{
    pOffline.blobStore.getBlob(pMutation.blobKey, (pError, pEntry) =>
    {
        if (!pEntry) return fCallback();

        let tmpURL = `/1.0/${pMutation.entity}/${pMutation.id}/Binary`;
        pRestClient.postBinary(tmpURL, pEntry.blob, pEntry.metadata.mimeType,
            (pPostError) =>
            {
                if (pPostError) return fCallback(pPostError);

                // Sync succeeded -- clear the dirty entry and delete the blob
                pOffline.dirtyTracker.clearBinaryMutation(pMutation.entity, pMutation.id);
                pOffline.blobStore.deleteBlob(pMutation.blobKey, fCallback);
            });
    });
}
```

Whether to delete after sync is a design choice. Keeping blobs around means the user can still view them offline (served from the cache) even after the server has a copy. Deleting them frees IndexedDB storage.

## Idempotency

Deleting a key that doesn't exist is a silent success. Safe to call multiple times.

## URL Revocation Side Effect

If an Object URL was created for this blob via `getBlobURL`, it gets revoked automatically. Any DOM element currently using that URL (e.g., an `<img>` tag) will see the image disappear on the next repaint.

## Related

- [storeBlob](api-storeBlob.md) -- put data in
- [getBlob](api-getBlob.md) -- read data
- `listBlobs(prefix, callback)` -- find keys to delete
- `clearAll(callback)` -- delete everything
