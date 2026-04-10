# connect

Start intercepting requests on a Fable `RestClient`. After `connect()` returns, any request whose URL matches a registered entity prefix is routed through IPC -> SQLite instead of HTTP. Non-matching requests pass through unchanged.

## Signature

```javascript
connect(pRestClient, pHeadlightRestClient)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pRestClient` | object | A Fable `RestClient` instance. If not provided, falls back to `fable.RestClient`. |
| `pHeadlightRestClient` | object | *Optional.* A `HeadlightRestClient` instance whose internal RestClient will also be intercepted. Usually you want to pass this if your app uses HeadlightRestClient. |

**Returns:** nothing. Logs an error if the provider isn't initialized or no RestClient is available.

## What It Does

1. Verifies `this.initialized === true` (errors out if not)
2. Resolves the RestClient argument: explicit argument, then `fable.RestClient`, then error
3. Wraps `RestClient.executeJSONRequest` in place via `RestClientInterceptor.connect()`
4. If `pHeadlightRestClient` is provided AND its internal `restClient` is a different instance, also wraps that
5. Connects binary interception via `BlobStoreManager` if available

The wrapping is a simple closure over the original function:

```javascript
// Inside RestClientInterceptor.connect (simplified)
pRestClient._originalExecuteJSONRequest = pRestClient.executeJSONRequest;
pRestClient.executeJSONRequest = (method, url, body, callback, opts) =>
{
    if (this.shouldIntercept(url))
    {
        return this.ipcOratorManager.invoke(method, url, body, callback);
    }
    return pRestClient._originalExecuteJSONRequest(method, url, body, callback, opts);
};
```

## Code Example: Standard Usage

```javascript
tmpOffline.initializeAsync((pError) =>
{
    if (pError) throw pError;

    tmpOffline.addEntity(bookSchema, () =>
    {
        // Connect using fable.RestClient
        tmpOffline.connect(_Fable.RestClient);

        // Now _Fable.RestClient.getJSON('/1.0/Books/0/10') is intercepted
    });
});
```

## Code Example: With HeadlightRestClient

`HeadlightRestClient` is a thin wrapper around `RestClient` that adds provider-JSON methods (`getJSON`, `putJSON`, `postJSON` with auto-retry and auth headers). It maintains its own internal `RestClient` instance. To intercept calls made through the HeadlightRestClient layer, pass it as the second argument:

```javascript
tmpOffline.connect(_Fable.RestClient, _Fable.HeadlightRestClient);
```

Without this, calls that go through HeadlightRestClient would bypass your interception entirely -- they'd hit the internal RestClient you didn't wrap. The provider detects whether HeadlightRestClient's internal `restClient` is the same instance as the one you passed first, and only wraps it again if it's a different instance.

## Code Example: Implicit RestClient

If you omit both arguments, the provider reaches for `fable.RestClient`:

```javascript
tmpOffline.connect();   // uses _Fable.RestClient
```

This is handy when you've already registered RestClient on fable and don't want to spell out the reference.

## Code Example: Connect / Disconnect Cycle

The interception is fully reversible:

```javascript
// Start intercepting
tmpOffline.connect(_Fable.RestClient);

// ... app uses RestClient normally, traffic goes through SQLite ...

// Stop intercepting
tmpOffline.disconnect(_Fable.RestClient);

// ... next calls hit the real network ...

// Start again
tmpOffline.connect(_Fable.RestClient);
```

This is how you typically sync dirty records: disconnect, replay mutations against the real server, reconnect. See [Sync Strategies](sync-strategies.md) for the full pattern.

## Order of Operations

`connect()` must be called **after** `initializeAsync()` and ideally after at least one `addEntity()` call. Calling it before entities are registered is valid but pointless -- nothing would be intercepted.

```
initializeAsync -> addEntity -> connect -> use RestClient -> disconnect
```

## Binary Interception

If `BlobStoreManager` is available (it always is unless you deliberately removed it), `connect()` also wires up binary interception via `connectBinary()`. This intercepts `executeBinaryUpload` and `executeChunkedRequest` on the RestClient so that `postBinary` and `getBinaryBlob` calls route through the blob store instead of hitting the network.

You don't have to do anything to enable this -- it happens automatically as part of `connect()`. If you want to opt out (e.g., because you always want binary traffic to go to the network), you can call `tmpOffline.restClientInterceptor.disconnectBinary()` afterward.

## Errors

| Scenario | Behavior |
|----------|----------|
| Provider not initialized | Logs error, returns without doing anything |
| No RestClient available | Logs error, returns without doing anything |
| `pRestClient.executeJSONRequest` is undefined | Logs error during wrap, the RestClient is left unmodified |

No exceptions are thrown. If something goes wrong, inspect the logs.

## Related

- [disconnect](api-disconnect.md) -- the inverse operation
- [initializeAsync](api-initializeAsync.md) -- must be called first
- [addEntity](api-addEntity.md) -- registers the URL prefixes that `connect()` will intercept
- [Architecture § Request Lifecycle](architecture.md#request-lifecycle--getjson) -- sequence diagram of what happens after connect
