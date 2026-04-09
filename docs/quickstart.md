# Quick Start

Get a Fable application running against a fully offline meadow data layer in under ten minutes. This walkthrough uses `sql.js` in the browser; see [Native Bridge](native-bridge.md) if you want to plug in native SQLite instead.

## 1. Install

```bash
npm install meadow-provider-offline sql.js fable
```

`sql.js` is listed as a peer/dev dependency so browser apps can choose the WASM bundle they prefer; you need to install it explicitly in your app.

## 2. Register and Instantiate the Provider

```javascript
const libFable = require('fable');
const libMeadowProviderOffline = require('meadow-provider-offline');

const _Fable = new libFable(
    {
        Product: 'MyOfflineApp',
        ProductVersion: '1.0.0'
    });

_Fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);

const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
        // Session bypass for browser-side meadow-endpoints
        SessionDataSource: 'None',
        DefaultSessionObject:
        {
            CustomerID: 1,
            SessionID: 'browser-offline',
            DeviceID: 'Browser',
            UserID: 1,
            UserRole: 'Administrator',
            UserRoleIndex: 255,
            LoggedIn: true
        }
    });
```

The session configuration tells `meadow-endpoints` to bypass authentication when running inside the browser. In production you may want a tighter session object; see the [Configuration Reference](configuration.md).

## 3. Initialize

```javascript
tmpOffline.initializeAsync((pError) =>
{
    if (pError)
    {
        console.error('Failed to initialize offline provider:', pError);
        return;
    }

    console.log('Offline provider ready');
    // ... rest of setup
});
```

`initializeAsync()` does the expensive work:

- Instantiates `DataCacheManager` and opens an in-memory SQLite database via `sql.js`
- Instantiates `IPCOratorManager` and starts an in-process Orator IPC server
- Instantiates `RestClientInterceptor`, `DirtyRecordTracker`, and `BlobStoreManager`
- Applies session configuration

Everything else runs inside the callback.

## 4. Add Entities

```javascript
const bookSchema = require('./schemas/Book.package.json');
const authorSchema = require('./schemas/Author.package.json');

tmpOffline.addEntity(bookSchema, (pBookError) =>
{
    if (pBookError) return;

    tmpOffline.addEntity(authorSchema, (pAuthorError) =>
    {
        if (pAuthorError) return;

        // Entities registered — ready to connect
    });
});
```

Each `addEntity` call:

1. Creates a `meadow` DAL from the package schema
2. Points it at the in-memory SQLite provider
3. Creates `meadow-endpoints`, with dirty-tracking hooks added
4. Creates the SQLite table
5. Registers the endpoint routes against the IPC server
6. Registers the URL prefix (`/1.0/Books`) with the interceptor

For bulk registration use `addEntities(pSchemas, fCallback)` — it's faster than chaining `addEntity` calls.

## 5. Connect the RestClient

```javascript
tmpOffline.connect(_Fable.RestClient);
```

This is the magic moment. The interceptor wraps `RestClient.executeJSONRequest` in place. After this call, any URL matching a registered entity prefix is routed through IPC → SQLite instead of hitting the network. Everything else forwards to the original RestClient untouched.

If you're using `HeadlightRestClient` (the enhanced client with provider JSON methods), pass it as the second argument so its internal RestClient gets intercepted too:

```javascript
tmpOffline.connect(_Fable.RestClient, _Fable.HeadlightRestClient);
```

## 6. Seed Data

Before the user goes offline, populate SQLite with records the app will need:

```javascript
// Fetch from server while still online
_Fable.RestClient.getJSON('/1.0/Books/0/10000', (pError, pResponse, pBooks) =>
{
    if (pError) return;

    tmpOffline.seedEntity('Book', pBooks);
    console.log(`Seeded ${pBooks.length} books into offline cache`);
});
```

`seedEntity()` clears the entity's SQLite table and inserts the provided records. Use it for bulk loads.

For ingesting records incrementally without clearing the table, use `tmpOffline.dataCacheManager.ingestRecords(entityName, records)` (performs upserts) — this is what cache-through mode uses internally.

## 7. Use It Normally

Now write code exactly as you would against a real server:

```javascript
_Fable.RestClient.getJSON('/1.0/Books/0/10', (pError, pResponse, pBooks) =>
{
    console.log('Got books from offline cache:', pBooks);
});

_Fable.RestClient.postJSON('/1.0/Book', { Title: 'A New Book', Author: 'Me' },
    (pError, pResponse, pCreated) =>
    {
        console.log('Created offline:', pCreated);
        // The dirty tracker has recorded this create for eventual sync
    });
```

Neither of these calls touches the network. The interceptor saw the `/1.0/Books` / `/1.0/Book` prefix, recognised it as a registered entity, and routed the request through the IPC → SQLite path.

## 8. Inspect Dirty Records

As soon as you start creating, updating, or deleting records through intercepted calls, the `DirtyRecordTracker` logs each mutation:

```javascript
console.log('Pending mutations:', tmpOffline.dirtyTracker.getDirtyCount());
// → 1

console.log('All mutations:', tmpOffline.dirtyTracker.getDirtyMutations());
// [
//   {
//     entity: 'Book',
//     id: 42,
//     operation: 'create',
//     record: { IDBook: 42, Title: 'A New Book', ... },
//     timestamp: 1712345678901
//   }
// ]
```

When the user comes back online, walk the mutations, replay them against the real server, and clear each one:

```javascript
function syncDirtyRecords(pOffline, pRestClient, fCallback)
{
    let tmpMutations = pOffline.dirtyTracker.getDirtyMutations();
    let tmpIndex = 0;

    let tmpNext = () =>
    {
        if (tmpIndex >= tmpMutations.length) return fCallback();

        let tmpMutation = tmpMutations[tmpIndex++];

        switch (tmpMutation.operation)
        {
        case 'create':
            pRestClient.postJSON(`/1.0/${tmpMutation.entity}`, tmpMutation.record,
                (pError, pResponse, pCreated) =>
                {
                    if (!pError)
                    {
                        pOffline.dirtyTracker.clearMutation(tmpMutation.entity, tmpMutation.id);
                        if (pCreated && pCreated[pOffline.getEntity(tmpMutation.entity).schema.DefaultIdentifier] !== tmpMutation.id)
                        {
                            pOffline.remapID(tmpMutation.entity, tmpMutation.id, pCreated[pOffline.getEntity(tmpMutation.entity).schema.DefaultIdentifier]);
                        }
                    }
                    tmpNext();
                });
            break;
        case 'update':
            pRestClient.putJSON(`/1.0/${tmpMutation.entity}`, tmpMutation.record,
                () => { pOffline.dirtyTracker.clearMutation(tmpMutation.entity, tmpMutation.id); tmpNext(); });
            break;
        case 'delete':
            pRestClient.deleteJSON(`/1.0/${tmpMutation.entity}/${tmpMutation.id}`,
                () => { pOffline.dirtyTracker.clearMutation(tmpMutation.entity, tmpMutation.id); tmpNext(); });
            break;
        }
    };
    tmpNext();
}
```

## 9. Disconnect When Done

To stop intercepting and restore original RestClient behavior:

```javascript
tmpOffline.disconnect(_Fable.RestClient);
```

This restores the original `executeJSONRequest` reference. Subsequent calls bypass the provider entirely.

## 10. What to Explore Next

- [Architecture](architecture.md) — sequence diagrams for the request lifecycle
- [Sync Strategies](sync-strategies.md) — coalescing, negative IDs, and remapping
- [Core Concepts](concepts.md) — the vocabulary
- [Entity Schema](entity-schema.md) — what shapes `addEntity` accepts
- [API Reference](api-reference.md) — per-method pages with code snippets for every public function

## Full Quickstart Script

```javascript
const libFable = require('fable');
const libMeadowProviderOffline = require('meadow-provider-offline');
const bookSchema = require('./schemas/Book.package.json');
const authorSchema = require('./schemas/Author.package.json');

const _Fable = new libFable({ Product: 'MyOfflineApp', ProductVersion: '1.0.0' });

_Fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);

const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
        SessionDataSource: 'None',
        DefaultSessionObject: { UserID: 1, UserRole: 'User', UserRoleIndex: 1, LoggedIn: true }
    });

tmpOffline.initializeAsync((pError) =>
{
    if (pError) throw pError;

    tmpOffline.addEntities([bookSchema, authorSchema], (pError) =>
    {
        if (pError) throw pError;

        tmpOffline.connect(_Fable.RestClient);
        tmpOffline.seedEntity('Book', []);
        tmpOffline.seedEntity('Author', []);

        // Application code below can now call RestClient as usual —
        // everything matching /1.0/Books or /1.0/Authors is handled
        // locally via IPC → SQLite.
    });
});
```
