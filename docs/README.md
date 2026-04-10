# Meadow Provider Offline

> Offline-capable Meadow provider with browser-side SQLite and transparent RestClient interception

Meadow Provider Offline turns any Fable/Meadow application into an offline-capable one without changing a single line of application code. It wraps the existing Fable `RestClient`, intercepts requests whose URLs match registered Meadow entity prefixes, and routes them through an in-process Orator IPC layer backed by an in-memory SQLite database. Requests that don't match meadow entities pass through to the real HTTP client, preserving auth, external API calls, and anything else the app already does.

The whole system is a classic interception wrapper following the pattern established by `pict-sessionmanager`. A `connect(restClient)` call wraps `executeJSONRequest` in place and keeps a reference to the original; `disconnect()` restores the original and leaves no trace. Your models, views, and controllers keep calling `getJSON` and `putJSON` with the same URLs they've always used -- the provider decides which ones to handle locally and which to forward to the network.

## Features

- **RestClient Interception** -- wraps the existing Fable `RestClient` rather than replacing it; non-meadow requests pass through unmodified
- **In-Memory SQLite** -- browser-side data persistence via `sql.js` WASM and `meadow-connection-sqlite-browser`
- **Full Meadow CRUD** -- Create, Read, Reads, Update, Delete, and Count endpoints work identically to the server
- **Dirty Record Tracking** -- local mutations tracked in an in-memory log with intelligent coalescing
- **Proactive Data Seeding** -- load server data into SQLite before going offline, or inject from native app wrappers
- **Cache-Through Mode** -- GETs that fall through to the network cache their results locally; dirty records are never overwritten
- **Negative ID Assignment** -- offline creates get negative IDs that are remapped to server-assigned positive IDs after sync
- **Native Bridge** -- swap `sql.js` for a native SQLite bridge function, eliminating WASM entirely on mobile
- **Binary / Blob Storage** -- offline storage for images, videos, and files via IndexedDB (or a delegate for iOS WKWebView)
- **Connect / Disconnect Pattern** -- reversible interception, same approach as `pict-sessionmanager`
- **First-Class Fable Service** -- standard lifecycle, logging, and service manager integration

## How It Works

```
Normal flow:     getJSON -> executeJSONRequest -> preRequest -> libSimpleGet -> HTTP
Intercepted:     getJSON -> executeJSONRequest (WRAPPED) -> check URL prefix
                   ├── Match   -> Orator IPC -> meadow-endpoints -> SQLite -> callback
                   └── No match -> original executeJSONRequest -> HTTP as normal
```

When you call `addEntity(bookSchema)`, the provider:

1. Instantiates a `meadow` DAL from the package schema
2. Points that DAL at the in-memory SQLite provider (or at a native bridge function, if one is set)
3. Creates `meadow-endpoints` for the DAL
4. Adds dirty-tracking lifecycle hooks on the endpoints (Create, Update, Delete all track)
5. Creates the SQLite table from the schema
6. Registers the endpoint routes against the in-process Orator IPC server
7. Registers the URL prefix (`/1.0/Books`) with the interceptor

After `connect(restClient)` is called, any URL matching a registered prefix is routed through the IPC server. The IPC server hits the CRUD endpoint, which hits meadow, which hits SQLite. The response comes back through the same channel and is handed to the original `getJSON` callback.

## Architecture

```
MeadowProviderOffline (Orchestrator)
  ├── DataCacheManager       -- SQLite via meadow-connection-sqlite-browser
  ├── IPCOratorManager       -- In-process Orator IPC server + meadow-endpoints
  ├── RestClientInterceptor  -- URL matching and request routing
  ├── DirtyRecordTracker     -- Mutation log with coalescing
  └── BlobStoreManager       -- IndexedDB binary storage (or delegate)
```

Each sub-service is a fable service provider in its own right. You can access any of them via accessors on the main provider: `dirtyTracker`, `dataCacheManager`, `ipcOratorManager`, `restClientInterceptor`, `blobStore`.

## Quick Start

```javascript
const libFable = require('fable');
const libMeadowProviderOffline = require('meadow-provider-offline');

const _Fable = new libFable({ Product: 'MyApp', ProductVersion: '1.0.0' });

_Fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
        SessionDataSource: 'None',
        DefaultSessionObject: { UserID: 1, UserRole: 'User', UserRoleIndex: 1, LoggedIn: true }
    });

tmpOffline.initializeAsync((pError) =>
{
    if (pError) throw pError;

    tmpOffline.addEntity(bookSchema, () =>
    {
        tmpOffline.connect(_Fable.RestClient);
        tmpOffline.seedEntity('Book', bookRecords);
        // Now RestClient.getJSON('/1.0/Books/0/10') routes through IPC -> SQLite
    });
});
```

See [Quick Start](quickstart.md) for a complete walkthrough.

## Where to Go Next

- [Quick Start](quickstart.md) -- five-minute end-to-end walkthrough
- [Architecture](architecture.md) -- request lifecycle, sequence diagrams, design trade-offs
- [Core Concepts](concepts.md) -- the vocabulary explained
- [Sync Strategies](sync-strategies.md) -- dirty coalescing and negative-ID remapping
- [Native Bridge](native-bridge.md) -- swap sql.js for native SQLite
- [API Reference](api-reference.md) -- one page per public method

## Related Packages

- [meadow](https://github.com/stevenvelozo/meadow) -- data access and ORM
- [meadow-endpoints](https://github.com/stevenvelozo/meadow-endpoints) -- automatic REST endpoints
- [meadow-connection-sqlite-browser](https://github.com/stevenvelozo/meadow-connection-sqlite-browser) -- browser SQLite
- [orator](https://github.com/stevenvelozo/orator) -- API server abstraction (used for IPC)
- [fable](https://github.com/stevenvelozo/fable) -- services framework
- [pict-sessionmanager](https://github.com/stevenvelozo/pict-sessionmanager) -- the interception pattern this module follows
