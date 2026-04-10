# Meadow Provider Offline

> Offline-capable Meadow provider with browser-side SQLite and transparent RestClient interception

Meadow Provider Offline turns any Fable/Meadow application into an offline-capable one without changing a single line of application code. It wraps the existing Fable `RestClient`, intercepts requests whose URLs match registered Meadow entity prefixes, and routes them through an in-process Orator IPC layer backed by an in-memory SQLite database (via `sql.js` WASM, or a native bridge on mobile). Requests that don't match meadow entities pass through to the real HTTP client, preserving auth, external API calls, and anything else your app already does.

The whole system follows the `pict-sessionmanager` interception pattern -- a `connect(restClient)` call wraps the client, a `disconnect()` call restores it. Your models, views, and controllers keep calling `getJSON` and `putJSON` with the same URLs they've always used; the provider figures out which ones to handle locally.

## Features

- **RestClient Interception** -- wraps the existing Fable `RestClient` rather than replacing it; non-meadow requests pass through unmodified
- **In-Memory SQLite** -- browser-side data persistence via `sql.js` WASM and `meadow-connection-sqlite-browser`
- **Full Meadow CRUD** -- Create, Read, Reads, Update, Delete, and Count endpoints work identically to the server
- **Dirty Record Tracking** -- tracks local mutations with intelligent coalescing (create + delete = no-op, create + update = create with latest data)
- **Proactive Data Seeding** -- load server data into SQLite before going offline, or inject data from native app wrappers
- **Cache-Through Mode** -- GET requests that fall through to the network cache their results locally for next time, never overwriting unsynced dirty records
- **Negative ID Assignment** -- offline creates get negative IDs that are remapped to server-assigned positive IDs after sync
- **Native Bridge** -- swap `sql.js` for a native SQLite bridge function, eliminating WASM entirely on mobile
- **Binary / Blob Storage** -- offline storage for images, videos, and files via IndexedDB (or a delegate for iOS WKWebView)
- **Connect / Disconnect Pattern** -- reversible interception, same approach as `pict-sessionmanager`
- **First-Class Fable Service** -- standard lifecycle, logging, and service manager integration

## Quick Start

```javascript
const libFable = require('fable');
const libMeadowProviderOffline = require('meadow-provider-offline');

const _Fable = new libFable(
    {
        Product: 'MyApp',
        ProductVersion: '1.0.0'
    });

// Register and instantiate the offline provider
_Fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
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

// Initialize (async -- sets up SQLite + Orator IPC)
tmpOffline.initializeAsync((pError) =>
{
    if (pError) { throw pError; }

    // Add entities from Meadow package schema objects
    tmpOffline.addEntity(bookSchema, (pBookError) =>
    {
        tmpOffline.addEntity(authorSchema, (pAuthorError) =>
        {
            // Start intercepting RestClient requests
            tmpOffline.connect(_Fable.RestClient);

            // Seed data (e.g., fetched from server before going offline)
            tmpOffline.seedEntity('Book', bookRecords);
            tmpOffline.seedEntity('Author', authorRecords);

            // Now RestClient.getJSON('/1.0/Books/0/10') routes through
            // IPC -> SQLite instead of HTTP
        });
    });
});
```

## Installation

```bash
npm install meadow-provider-offline
```

## How It Works

```
Normal flow:     getJSON -> executeJSONRequest -> preRequest -> libSimpleGet -> HTTP
Intercepted:     getJSON -> executeJSONRequest (WRAPPED) -> check URL prefix
                   ├── Match   -> Orator IPC -> meadow-endpoints -> SQLite -> callback
                   └── No match -> original executeJSONRequest -> HTTP as normal
```

The wrapper function replaces `RestClient.executeJSONRequest` in place and closes over the original. When a request comes in, the interceptor normalises the URL, checks it against the registered entity prefixes, and either routes the request through the in-process Orator IPC server or forwards to the wrapped function. `disconnect()` restores the original reference, leaving no trace.

## Architecture

```
MeadowProviderOffline (Orchestrator)
  ├── DataCacheManager       -- SQLite via meadow-connection-sqlite-browser
  ├── IPCOratorManager       -- In-process Orator IPC server + meadow-endpoints
  ├── RestClientInterceptor  -- URL matching and request routing
  ├── DirtyRecordTracker     -- Mutation log with coalescing
  └── BlobStoreManager       -- IndexedDB binary storage (or delegate)
```

Each sub-service is a fable service provider in its own right. You can access any of them via accessors on the main provider (`dirtyTracker`, `dataCacheManager`, `ipcOratorManager`, `restClientInterceptor`, `blobStore`).

## Documentation

Full documentation lives in the [`docs`](./docs) folder and is served via [pict-docuserve](https://github.com/stevenvelozo/pict-docuserve):

- [Overview](docs/README.md) -- what it solves, how it composes
- [Quick Start](docs/quickstart.md) -- five-minute walkthrough
- [Architecture](docs/architecture.md) -- request lifecycle with Mermaid sequence diagrams
- [Core Concepts](docs/concepts.md) -- entities, interception, dirty tracking, cache-through
- [Entity Schema](docs/entity-schema.md) -- the meadow package schema format entities are built from
- [Sync Strategies](docs/sync-strategies.md) -- dirty record coalescing and negative-ID remapping
- [Native Bridge](docs/native-bridge.md) -- replacing `sql.js` with a native SQLite bridge
- [Configuration Reference](docs/configuration.md) -- every constructor option
- [API Reference](docs/api-reference.md) -- per-method pages for every public function

## Related Packages

- [meadow](https://github.com/stevenvelozo/meadow) -- data access and ORM
- [meadow-endpoints](https://github.com/stevenvelozo/meadow-endpoints) -- automatic REST endpoints for Meadow
- [meadow-connection-sqlite-browser](https://github.com/stevenvelozo/meadow-connection-sqlite-browser) -- browser-side SQLite via sql.js
- [foxhound](https://github.com/stevenvelozo/foxhound) -- query DSL for SQL generation
- [orator](https://github.com/stevenvelozo/orator) -- API server abstraction (used for IPC)
- [fable](https://github.com/stevenvelozo/fable) -- application services framework
- [pict-sessionmanager](https://github.com/stevenvelozo/pict-sessionmanager) -- session management and the interception pattern this module follows

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/stevenvelozo/retold/blob/main/docs/contributing.md).
