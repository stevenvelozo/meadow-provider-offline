# Meadow Provider Offline

> Offline-capable Meadow provider with browser-side SQLite and IPC routing

Meadow Provider Offline intercepts REST requests destined for Meadow endpoints and routes them through an in-process Orator IPC layer backed by an in-memory SQLite database (via sql.js WASM). Non-matching requests pass through to the real HTTP client, preserving auth, external API calls, and other non-meadow traffic. Designed for building offline-capable Pict applications.

## Features

- **RestClient Interception** - Wraps the existing Fable RestClient rather than replacing it; non-meadow requests pass through unmodified
- **In-Memory SQLite** - Browser-side data persistence via sql.js WASM and meadow-connection-sqlite-browser
- **Full Meadow CRUD** - Create, Read, Reads, Update, Delete, Count endpoints work identically to the server
- **Dirty Record Tracking** - Tracks local mutations with coalescing logic (create + delete = no-op, create + update = create with latest data)
- **Proactive Data Seeding** - Load server data into SQLite before going offline; inject data from native app wrappers
- **Connect/Disconnect Pattern** - Reversible interception following pict-sessionmanager's established pattern
- **Fable Integration** - First-class services in the Fable/Orator ecosystem

## Quick Start

```javascript
const libFable = require('fable');
const libMeadowProviderOffline = require('meadow-provider-offline');

const _Fable = new libFable({
	Product: 'MyApp',
	ProductVersion: '1.0.0'
});

// Register and instantiate the offline provider
_Fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);
const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline', {
	SessionDataSource: 'None',
	DefaultSessionObject: {
		CustomerID: 1,
		SessionID: 'browser-offline',
		DeviceID: 'Browser',
		UserID: 1,
		UserRole: 'Administrator',
		UserRoleIndex: 255,
		LoggedIn: true
	}
});

// Initialize (async - sets up SQLite + Orator IPC)
tmpOffline.initializeAsync((pError) =>
{
	if (pError) { throw pError; }

	// Add entities from Meadow schema package objects
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

Meadow Provider Offline intercepts `executeJSONRequest` on the existing RestClient. When a request URL matches a registered entity prefix, it short-circuits the HTTP pipeline and routes through Orator IPC to meadow-endpoints backed by SQLite. Unmatched URLs flow through to the original RestClient.

```
Normal flow:     getJSON -> executeJSONRequest -> preRequest -> libSimpleGet -> HTTP
Intercepted:     getJSON -> executeJSONRequest (WRAPPED) -> check URL prefix
                   |-- Match   -> Orator IPC -> meadow-endpoints -> SQLite -> callback
                   '-- No match -> original executeJSONRequest -> HTTP as normal
```

### Architecture

```
MeadowProviderOffline (Orchestrator)
  |-- RestClientInterceptor (URL matching + request routing)
  |-- IPCOratorManager (Orator IPC + pre-behavior patching)
  |-- DataCacheManager (SQLite via meadow-connection-sqlite-browser)
  '-- DirtyRecordTracker (Mutation log with coalescing)
```

## API

### `MeadowProviderOffline`

The main orchestrator service. Register with Fable's service manager.

| Method | Description |
|--------|-------------|
| `initializeAsync(fCallback)` | Initialize SQLite, Orator IPC, and sub-services |
| `addEntity(pSchema, fCallback)` | Register a Meadow entity (creates DAL, endpoints, SQLite table) |
| `removeEntity(pEntityName)` | Unregister an entity |
| `seedEntity(pEntityName, pRecords, fCallback)` | Load records into the entity's SQLite table |
| `injectRecords(pEntityName, pRecords, fCallback)` | Alias for seedEntity (semantic clarity for native app injection) |
| `connect(pRestClient)` | Start intercepting requests on the RestClient |
| `disconnect(pRestClient)` | Stop intercepting; restore original RestClient behavior |

| Property | Description |
|----------|-------------|
| `initialized` | Whether the provider is ready |
| `entityNames` | Array of registered entity names |
| `getEntity(name)` | Get entity's `{ dal, endpoints, schema }` |
| `dirtyTracker` | Access the DirtyRecordTracker |
| `dataCacheManager` | Access the DataCacheManager |
| `ipcOratorManager` | Access the IPCOratorManager |

### `DirtyRecordTracker`

Tracks local mutations for eventual sync back to the server.

| Method | Description |
|--------|-------------|
| `trackMutation(entity, id, operation, record)` | Track a create/update/delete |
| `getDirtyMutations()` | Get all pending mutations |
| `getDirtyCount()` | Count of pending mutations |
| `getDirtyMutationsForEntity(entity)` | Mutations for a specific entity |
| `clearMutation(entity, id)` | Clear a specific mutation after sync |
| `clearEntity(entity)` | Clear all mutations for an entity |
| `clearAll()` | Clear all mutations |
| `hasDirtyRecords()` | Whether any mutations are pending |

**Coalescing logic:**
- Create + Delete = removed (no-op, never needs sync)
- Create + Update = Create with latest data

### `DataCacheManager`

Manages the in-memory SQLite database.

| Method | Description |
|--------|-------------|
| `initializeAsync(fCallback)` | Create the SQLite database |
| `createTable(pPackageSchema, fCallback)` | Create a table from a Meadow package schema |
| `dropTable(pTableName, fCallback)` | Drop a table |
| `resetTable(pPackageSchema, fCallback)` | Drop and recreate a table |
| `seedTable(pTableName, pRecords)` | Clear and insert records |
| `clearTable(pTableName)` | Delete all rows |
| `convertPackageSchemaToTableSchema(pSchema)` | Convert Meadow package types to DDL types |

## Configuration

Options passed to the service provider constructor:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `SessionDataSource` | string | `"None"` | Session data source for meadow-endpoints |
| `DefaultSessionObject` | object | `{ UserID: 1, ... }` | Default session for browser-side endpoints |
| `MeadowEndpoints` | object | _(none)_ | MeadowEndpoints URL config (ServerProtocol, ServerAddress, ServerPort) |

## Entity Schema Format

Entities are added using Meadow package schema objects (the same JSON format used by `Meadow.loadFromPackageObject`):

```javascript
{
	Scope: 'Book',
	DefaultIdentifier: 'IDBook',
	Schema: [
		{ Column: 'IDBook', Type: 'AutoIdentity' },
		{ Column: 'GUIDBook', Type: 'AutoGUID' },
		{ Column: 'Title', Type: 'String' },
		{ Column: 'CreateDate', Type: 'CreateDate' },
		{ Column: 'CreatingIDUser', Type: 'CreateIDUser' },
		{ Column: 'UpdateDate', Type: 'UpdateDate' },
		{ Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
		{ Column: 'Deleted', Type: 'Deleted' }
	],
	DefaultObject: { IDBook: null, GUIDBook: '', Title: 'Unknown', ... },
	JsonSchema: { title: 'Book', type: 'object', properties: { ... } },
	Authorization: { Administrator: { Create: 'Allow', Read: 'Allow', ... } }
}
```

## Testing

```bash
npm test
```

## Related Packages

- [meadow](https://github.com/stevenvelozo/meadow) - Data access and ORM
- [meadow-endpoints](https://github.com/stevenvelozo/meadow-endpoints) - Automatic REST endpoints for Meadow
- [meadow-connection-sqlite-browser](https://github.com/stevenvelozo/meadow-connection-sqlite-browser) - Browser-side SQLite via sql.js
- [foxhound](https://github.com/stevenvelozo/foxhound) - Query DSL for SQL generation
- [orator](https://github.com/stevenvelozo/orator) - API server abstraction
- [fable](https://github.com/stevenvelozo/fable) - Application services framework
- [pict-sessionmanager](https://github.com/stevenvelozo/pict-sessionmanager) - Session management with RestClient interception pattern

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/stevenvelozo/retold/blob/main/docs/contributing.md).
