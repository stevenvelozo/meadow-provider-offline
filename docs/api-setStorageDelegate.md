# BlobStoreManager.setStorageDelegate

Install an external storage delegate for blob operations. When a delegate is set, all storage operations (store, get, delete, list, clear) route through the delegate instead of IndexedDB. This enables native bridging in environments like iOS WKWebView where IndexedDB is unreliable, or Electron where you'd rather use the filesystem.

## Signature

```javascript
blobStore.setStorageDelegate(pDelegate)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pDelegate` | `BlobStorageDelegate` | An object implementing the delegate interface (see below) |

**Returns:** nothing.

## When to Call It

Call `setStorageDelegate()` **before** `initializeAsync()` to skip IndexedDB setup entirely. If you call it after initialization, the delegate takes effect for subsequent calls but the IndexedDB database is still open (harmless but wasted resources).

```javascript
// Correct order
tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {});
tmpOffline.blobStore.setStorageDelegate(myDelegate);     // Before init
tmpOffline.initializeAsync(() => { /* ... */ });
```

## Delegate Interface

The delegate object must implement five methods:

```javascript
{
    storeBlob(pKey, pBlobData, pMetadata, fCallback)
    // -> fCallback(pError)

    getBlob(pKey, fCallback)
    // -> fCallback(pError, { blob, metadata } | null)

    deleteBlob(pKey, fCallback)
    // -> fCallback(pError)

    listBlobs(pPrefix, fCallback)
    // -> fCallback(pError, [{ key, metadata }, ...])

    clearAll(fCallback)
    // -> fCallback(pError)
}
```

`setStorageDelegate` verifies all five methods are present and logs an error (and refuses to set the delegate) if any are missing.

## Code Example: iOS Native Delegate

```javascript
const iosBlobDelegate =
    {
        storeBlob(pKey, pBlobData, pMetadata, fCallback)
        {
            // Convert Blob/ArrayBuffer to base64 for the bridge
            if (pBlobData instanceof Blob)
            {
                let tmpReader = new FileReader();
                tmpReader.onload = () =>
                {
                    let tmpBase64 = tmpReader.result.split(',')[1];
                    window.webkit.messageHandlers.blobStore.postMessage(
                        {
                            op: 'store',
                            key: pKey,
                            base64: tmpBase64,
                            metadata: pMetadata,
                            callbackId: registerPendingCallback(fCallback)
                        });
                };
                tmpReader.readAsDataURL(pBlobData);
            }
            // ... handle ArrayBuffer path too
        },

        getBlob(pKey, fCallback)
        {
            window.webkit.messageHandlers.blobStore.postMessage(
                {
                    op: 'get',
                    key: pKey,
                    callbackId: registerPendingCallback((pError, pResult) =>
                    {
                        if (pError) return fCallback(pError);
                        if (!pResult) return fCallback(null, null);

                        // Convert base64 back to Blob
                        let tmpBytes = Uint8Array.from(
                            atob(pResult.base64), (pC) => pC.charCodeAt(0));
                        let tmpBlob = new Blob([tmpBytes], { type: pResult.metadata.mimeType });
                        fCallback(null, { blob: tmpBlob, metadata: pResult.metadata });
                    })
                });
        },

        deleteBlob(pKey, fCallback)
        {
            window.webkit.messageHandlers.blobStore.postMessage(
                {
                    op: 'delete',
                    key: pKey,
                    callbackId: registerPendingCallback(fCallback)
                });
        },

        listBlobs(pPrefix, fCallback)
        {
            window.webkit.messageHandlers.blobStore.postMessage(
                {
                    op: 'list',
                    prefix: pPrefix,
                    callbackId: registerPendingCallback(fCallback)
                });
        },

        clearAll(fCallback)
        {
            window.webkit.messageHandlers.blobStore.postMessage(
                {
                    op: 'clear',
                    callbackId: registerPendingCallback(fCallback)
                });
        }
    };

tmpOffline.blobStore.setStorageDelegate(iosBlobDelegate);
tmpOffline.initializeAsync(() => { /* ... */ });
```

## Code Example: Filesystem Delegate (Electron)

```javascript
const libFS = require('fs');
const libPath = require('path');

const BLOB_DIR = './offline-blobs';
if (!libFS.existsSync(BLOB_DIR)) libFS.mkdirSync(BLOB_DIR, { recursive: true });

const electronBlobDelegate =
    {
        storeBlob(pKey, pBlobData, pMetadata, fCallback)
        {
            let tmpPath = libPath.join(BLOB_DIR, encodeURIComponent(pKey));
            let tmpMetaPath = tmpPath + '.meta.json';

            let _writeBuffer = (pBuffer) =>
            {
                libFS.writeFile(tmpPath, pBuffer, (pError) =>
                {
                    if (pError) return fCallback(pError);
                    libFS.writeFile(tmpMetaPath, JSON.stringify(pMetadata), fCallback);
                });
            };

            if (pBlobData instanceof Blob)
            {
                pBlobData.arrayBuffer().then((pBuf) => _writeBuffer(Buffer.from(pBuf)));
            }
            else if (pBlobData instanceof ArrayBuffer)
            {
                _writeBuffer(Buffer.from(pBlobData));
            }
            else
            {
                _writeBuffer(pBlobData);
            }
        },

        getBlob(pKey, fCallback)
        {
            let tmpPath = libPath.join(BLOB_DIR, encodeURIComponent(pKey));
            let tmpMetaPath = tmpPath + '.meta.json';

            if (!libFS.existsSync(tmpPath)) return fCallback(null, null);

            libFS.readFile(tmpPath, (pError, pData) =>
            {
                if (pError) return fCallback(pError);
                libFS.readFile(tmpMetaPath, 'utf8', (pErr, pMetaJSON) =>
                {
                    let tmpMeta = pErr ? {} : JSON.parse(pMetaJSON);
                    let tmpBlob = new Blob([pData], { type: tmpMeta.mimeType || 'application/octet-stream' });
                    fCallback(null, { blob: tmpBlob, metadata: tmpMeta });
                });
            });
        },

        deleteBlob(pKey, fCallback)
        {
            let tmpPath = libPath.join(BLOB_DIR, encodeURIComponent(pKey));
            let tmpMetaPath = tmpPath + '.meta.json';
            if (libFS.existsSync(tmpPath)) libFS.unlinkSync(tmpPath);
            if (libFS.existsSync(tmpMetaPath)) libFS.unlinkSync(tmpMetaPath);
            fCallback();
        },

        listBlobs(pPrefix, fCallback)
        {
            let tmpEntries = [];
            let tmpFiles = libFS.readdirSync(BLOB_DIR);
            for (let tmpFile of tmpFiles)
            {
                if (tmpFile.endsWith('.meta.json')) continue;
                let tmpKey = decodeURIComponent(tmpFile);
                if (!pPrefix || tmpKey.startsWith(pPrefix))
                {
                    let tmpMetaPath = libPath.join(BLOB_DIR, tmpFile + '.meta.json');
                    let tmpMeta = {};
                    if (libFS.existsSync(tmpMetaPath))
                    {
                        tmpMeta = JSON.parse(libFS.readFileSync(tmpMetaPath, 'utf8'));
                    }
                    tmpEntries.push({ key: tmpKey, metadata: tmpMeta });
                }
            }
            fCallback(null, tmpEntries);
        },

        clearAll(fCallback)
        {
            let tmpFiles = libFS.readdirSync(BLOB_DIR);
            for (let tmpFile of tmpFiles)
            {
                libFS.unlinkSync(libPath.join(BLOB_DIR, tmpFile));
            }
            fCallback();
        }
    };

tmpOffline.blobStore.setStorageDelegate(electronBlobDelegate);
```

## Validation

`setStorageDelegate` checks that the delegate has all five required methods. If any are missing, it logs an error and leaves the current delegate (or IndexedDB) in place:

```javascript
tmpOffline.blobStore.setStorageDelegate({ storeBlob: () => {} });
// -> Logs: "BlobStoreManager: Storage delegate missing required method "getBlob" -- delegate not set."
```

## Switching Backends

You can switch between delegates at runtime -- call `setStorageDelegate` with a new delegate and subsequent calls will route through it. Data already stored in the previous backend is **not** migrated -- if you store under IndexedDB, switch to a delegate, and then try to read, the reads hit the delegate and return nothing.

To migrate data between backends, `listBlobs` on the old backend, `getBlob` each entry, and `storeBlob` them into the new one before switching.

## Related

- [Native Bridge](native-bridge.md) -- companion feature for SQL (sets a separate native bridge via `setNativeBridge`)
- [storeBlob](api-storeBlob.md) / [getBlob](api-getBlob.md) / [deleteBlob](api-deleteBlob.md) -- route through the delegate when set
- [Architecture § Binary / Blob Lifecycle](architecture.md#binary--blob-lifecycle)
