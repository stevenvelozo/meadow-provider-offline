# BlobStoreManager.getBlobURL

Get an Object URL for a stored blob, ready to drop into an `<img>`, `<video>`, or `<a>` element. Internally wraps `getBlob` and calls `URL.createObjectURL` on the result.

## Signature

```javascript
blobStore.getBlobURL(pKey, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pKey` | string | The blob's storage key |
| `fCallback` | function | Callback with signature `(pError, pURL)` where `pURL` is the `blob:...` Object URL |

**Returns:** nothing. Result delivered via callback.

## Code Example: Image Preview

```javascript
tmpOffline.blobStore.getBlobURL('Artifact:3:v1', (pError, pURL) =>
{
    if (pError) return console.error(pError);
    if (!pURL) return console.log('Blob not found');

    let tmpImage = document.getElementById('preview');
    tmpImage.src = pURL;
});
```

The URL is safe to assign to `img.src`, `video.src`, `a.href`, or any other attribute that accepts a URL.

## Code Example: Gallery From a Prefix Listing

```javascript
tmpOffline.blobStore.listBlobs('Artifact:3:', (pError, pEntries) =>
{
    if (pError) return;

    for (let tmpEntry of pEntries)
    {
        tmpOffline.blobStore.getBlobURL(tmpEntry.key, (pError, pURL) =>
        {
            if (pURL)
            {
                let tmpImg = document.createElement('img');
                tmpImg.src = pURL;
                document.getElementById('gallery').appendChild(tmpImg);
            }
        });
    }
});
```

## URL Tracking and Revocation

Object URLs consume memory until they're revoked (the browser holds onto the underlying blob while the URL is alive). `BlobStoreManager` tracks every URL it creates in an internal `Map` so it can revoke them in bulk:

```javascript
// When you're done with a whole screen worth of blobs
tmpOffline.blobStore.revokeAllURLs();
```

This releases every URL that was created via `getBlobURL`, freeing memory. Individual URLs are also revoked automatically when:

- The page unloads
- The same key is stored again (the old URL is revoked before the new one is created)
- The key is deleted via `deleteBlob`

If you need to revoke just one URL manually, call the standard Web API:

```javascript
URL.revokeObjectURL(tmpOldURL);
```

## Code Example: Lifecycle With Revocation

```javascript
// On mount
let tmpActiveURLs = [];
tmpOffline.blobStore.getBlobURL('Artifact:3:v1', (pError, pURL) =>
{
    if (pURL)
    {
        tmpActiveURLs.push(pURL);
        document.getElementById('preview').src = pURL;
    }
});

// On unmount
for (let tmpURL of tmpActiveURLs)
{
    URL.revokeObjectURL(tmpURL);
}
tmpActiveURLs = [];
```

Or, more simply, use `revokeAllURLs` at unmount time to clean up everything the blob store created across the session.

## Not Found Behavior

Same as `getBlob` — if the key doesn't exist, callback gets `(null, null)`. No error, no URL.

## Degraded Mode

In degraded mode `getBlobURL` always calls back with `(null, null)`.

## Related

- [getBlob](api-getBlob.md) — the raw-blob variant
- [storeBlob](api-storeBlob.md) — put data in
- `revokeAllURLs()` — bulk cleanup of URLs this method has created
