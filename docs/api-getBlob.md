# BlobStoreManager.getBlob

Retrieve a stored blob and its metadata by key.

## Signature

```javascript
blobStore.getBlob(pKey, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pKey` | string | The blob's storage key |
| `fCallback` | function | Callback with signature `(pError, pBlobEntry)` where `pBlobEntry` is `{ blob, metadata }` |

**Returns:** nothing. Result delivered via callback.

## Return Shape

On success:

```javascript
{
    blob: Blob,           // The binary data as a Blob object
    metadata:
    {
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        size: 234567,
        entityType: 'Artifact',
        entityID: 3,
        version: 1,
        createdAt: '2024-04-09T17:30:00.000Z'
    }
}
```

On failure or missing blob, `pBlobEntry` is `null` or `undefined`.

## Code Example: Basic Usage

```javascript
tmpOffline.blobStore.getBlob('Artifact:3:v1', (pError, pEntry) =>
{
    if (pError) return console.error(pError);
    if (!pEntry)
    {
        console.log('Blob not found');
        return;
    }

    console.log('Type:', pEntry.metadata.mimeType);
    console.log('Size:', pEntry.metadata.size);
    console.log('Blob:', pEntry.blob);
});
```

## Code Example: Use as an `<img>` Source

For rendering in an image tag, `getBlobURL` is simpler -- see [getBlobURL](api-getBlobURL.md). But you can also do it manually with `URL.createObjectURL`:

```javascript
tmpOffline.blobStore.getBlob('Artifact:3:v1', (pError, pEntry) =>
{
    if (pError || !pEntry) return;

    let tmpURL = URL.createObjectURL(pEntry.blob);
    document.getElementById('preview').src = tmpURL;

    // When done, revoke to release memory
    // URL.revokeObjectURL(tmpURL);
});
```

## Code Example: Reading Bytes

```javascript
tmpOffline.blobStore.getBlob('Document:5:v1', (pError, pEntry) =>
{
    if (pError || !pEntry) return;

    pEntry.blob.arrayBuffer().then((pBuffer) =>
    {
        console.log('Got', pBuffer.byteLength, 'bytes');
        // Process the buffer...
    });
});
```

## Code Example: Sync Replay

During offline sync, you retrieve stored blobs from the store and post them to the real server:

```javascript
function syncOneBinary(pOffline, pRestClient, pBinaryMutation, fCallback)
{
    pOffline.blobStore.getBlob(pBinaryMutation.blobKey, (pError, pEntry) =>
    {
        if (pError || !pEntry)
        {
            console.error('Missing blob:', pBinaryMutation.blobKey);
            return fCallback();
        }

        let tmpURL = `/1.0/${pBinaryMutation.entity}/${pBinaryMutation.id}/Binary`;
        pRestClient.postBinary(tmpURL, pEntry.blob, pEntry.metadata.mimeType,
            (pPostError) =>
            {
                if (!pPostError)
                {
                    pOffline.dirtyTracker.clearBinaryMutation(
                        pBinaryMutation.entity, pBinaryMutation.id);
                }
                return fCallback(pPostError);
            });
    });
}
```

## Not Found Behavior

If the key doesn't exist in storage, `getBlob` calls back with `(null, null)` -- no error, null result. Always check the result before dereferencing:

```javascript
tmpOffline.blobStore.getBlob('NonExistent:1:v1', (pError, pEntry) =>
{
    if (pError) return console.error(pError);
    if (!pEntry) return console.log('Not found');

    // Safe to use pEntry.blob and pEntry.metadata
});
```

## Degraded Mode

In degraded mode (no IndexedDB, no delegate), `getBlob` always calls back with `(null, null)`. Useful for tests, but obviously you can't read anything back that you tried to store.

## Related

- [storeBlob](api-storeBlob.md) -- the counterpart that puts data in
- [getBlobURL](api-getBlobURL.md) -- get an Object URL directly without manual handling
- [deleteBlob](api-deleteBlob.md) -- remove a stored blob
- [Architecture § Binary / Blob Lifecycle](architecture.md#binary--blob-lifecycle)
