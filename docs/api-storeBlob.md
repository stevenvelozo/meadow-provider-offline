# BlobStoreManager.storeBlob

Store a binary blob (image, video, file, arbitrary bytes) in IndexedDB (or the delegate) with associated metadata.

## Signature

```javascript
blobStore.storeBlob(pKey, pBlobData, pMetadata, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pKey` | string | Unique storage key, typically `<EntityType>:<ID>:v<Version>` |
| `pBlobData` | `Blob` \| `File` \| `ArrayBuffer` | The binary data to store |
| `pMetadata` | object | Metadata for the blob (MIME type, file name, size, etc.) |
| `fCallback` | function | Callback with signature `(pError)` |

**Returns:** nothing. Result delivered via callback.

## Metadata Shape

```javascript
{
    mimeType: 'image/jpeg',
    fileName: 'photo.jpg',
    size: 234567,              // in bytes
    entityType: 'Artifact',
    entityID: 3,
    version: 1,
    createdAt: '2024-04-09T17:30:00.000Z'
}
```

All fields are optional but recommended. The metadata is stored alongside the blob and returned by `getBlob` and `listBlobs`.

## Code Example: Storing an Image

```javascript
// The image came from a file input
const tmpFile = document.getElementById('fileInput').files[0];

const tmpKey = `Artifact:3:v1`;
const tmpMetadata =
    {
        mimeType: tmpFile.type,
        fileName: tmpFile.name,
        size: tmpFile.size,
        entityType: 'Artifact',
        entityID: 3,
        version: 1,
        createdAt: new Date().toISOString()
    };

tmpOffline.blobStore.storeBlob(tmpKey, tmpFile, tmpMetadata, (pError) =>
{
    if (pError) return console.error(pError);
    console.log('Blob stored:', tmpKey);
});
```

## Code Example: Storing From an ArrayBuffer

```javascript
fetch('/some/image.jpg').then((pResponse) =>
{
    pResponse.arrayBuffer().then((pBuffer) =>
    {
        tmpOffline.blobStore.storeBlob(
            'Image:100:v1',
            pBuffer,
            {
                mimeType: 'image/jpeg',
                fileName: 'image.jpg',
                size: pBuffer.byteLength,
                entityType: 'Image',
                entityID: 100,
                version: 1,
                createdAt: new Date().toISOString()
            },
            (pError) =>
            {
                if (pError) return console.error(pError);
                console.log('Fetched and stored');
            });
    });
});
```

## Key Convention

The provider's binary interception layer uses keys of the form `<EntityType>:<ID>:v<Version>`. For example:

- `Artifact:3:v1` -- version 1 of Artifact 3
- `Image:42:v1` -- version 1 of Image 42
- `Artifact:3:v2` -- version 2 of Artifact 3 (after an edit)

This format makes it easy to `listBlobs('Artifact:3:')` and see all versions of a specific artifact.

If you're using the blob store outside the interception layer, you can use any key format you want -- the store itself doesn't enforce the convention. It just needs to be a unique string.

## Degraded Mode

When neither IndexedDB nor a storage delegate is available (Node.js test environment, for example), the blob store initializes in **degraded mode**. `storeBlob` in degraded mode is a no-op that logs a warning and calls back with `null` (no error).

You can detect degraded mode via `tmpOffline.blobStore.degraded`:

```javascript
if (tmpOffline.blobStore.degraded)
{
    console.warn('Blob store is degraded -- calls are no-ops');
}
```

## Delegate Path

If a storage delegate was set via `setStorageDelegate()`, `storeBlob` forwards to the delegate's `storeBlob(key, data, metadata, callback)` method instead of hitting IndexedDB. This lets native hosts (iOS WKWebView, Android WebView) own blob storage without the provider touching IndexedDB at all.

## Dirty Tracking Side Effect

When the blob store is called via the provider's binary interception (`postBinary`), the provider also calls `dirtyTracker.trackBinaryMutation(entity, id, key, mimeType)` to record the mutation. When you call `storeBlob` directly, the dirty tracker is **not** updated automatically -- add the call yourself if you need sync tracking:

```javascript
tmpOffline.blobStore.storeBlob(tmpKey, tmpFile, tmpMetadata, (pError) =>
{
    if (pError) return;
    tmpOffline.dirtyTracker.trackBinaryMutation('Artifact', 3, tmpKey, tmpFile.type);
});
```

## Related

- [getBlob](api-getBlob.md) -- retrieve a stored blob
- [getBlobURL](api-getBlobURL.md) -- get an Object URL for use in `<img>`/`<video>` tags
- [deleteBlob](api-deleteBlob.md) -- remove a blob
- [setStorageDelegate](api-setStorageDelegate.md) -- plug in native blob storage
- [trackBinaryMutation](api-trackBinaryMutation.md) -- record the mutation for sync
