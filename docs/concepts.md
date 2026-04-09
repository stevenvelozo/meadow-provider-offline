# Core Concepts

The Meadow Provider Offline vocabulary is small. Once you understand these six terms — Provider, Entity, Interception, Dirty Record, Cache-Through, and Blob — everything else in the API reference reads directly.

## Provider

The **Provider** is the `MeadowProviderOffline` instance itself. It's a Fable service provider that orchestrates five sub-services (data cache, IPC orator, interceptor, dirty tracker, blob store) and exposes a small public API for registering entities, connecting to RestClients, and inspecting state.

You create one provider per Fable instance, register it with the service manager, and call `initializeAsync()` before any other method. The provider's lifecycle is:

```
instantiate → initializeAsync → addEntity(s) → connect → use → disconnect
```

## Entity

An **Entity** is a meadow schema you've registered with the provider. Each entity is a JSON object (typically produced by `meadow-schema-pkg` or hand-written) with at minimum a `Scope` (the entity name) and a `Schema` array (the column definitions). Calling `addEntity(schema)`:

1. Creates a `meadow` DAL from the schema
2. Creates `meadow-endpoints` on that DAL
3. Creates the SQLite table (via `CREATE TABLE IF NOT EXISTS ...`)
4. Registers the endpoint routes with the IPC server
5. Registers the URL prefix (`/1.0/<Scope>`) with the interceptor

After registration, the provider holds references to the DAL, endpoints, and schema in `provider._Entities[name]`. You can retrieve them via `provider.getEntity(name)`.

See [Entity Schema](entity-schema.md) for the full meadow package schema format.

## Interception

**Interception** is the act of wrapping `RestClient.executeJSONRequest` in place so that requests matching registered entity prefixes are routed through the in-process IPC server instead of going to the network. This is done by the `RestClientInterceptor` sub-service.

The critical design point: interception is **additive and reversible**. The wrapper closes over a reference to the original function. When a request comes in, the wrapper checks the URL; if it matches, it handles the request locally; if it doesn't, it forwards to the original. Calling `disconnect()` restores the original reference and the RestClient behaves exactly as it did before.

URLs are matched by prefix, not by full match. A single entity registration (e.g., `/1.0/Books`) intercepts every request that starts with that prefix — the list endpoint, single-record endpoints, count endpoints, filtered list endpoints, etc.

### URL Normalisation

Before matching, URLs are normalised:

- Query strings are stripped
- Trailing slashes are removed
- Leading `/` is ensured
- Relative URLs are resolved against `fable.ServiceServerURL` if set

This means `/1.0/Books?limit=10` and `/1.0/Books/` both match the `/1.0/Books` prefix.

## Dirty Record

A **Dirty Record** is a mutation (create, update, or delete) that happened locally and hasn't been synced to the server yet. Every mutation that flows through an intercepted endpoint is recorded in the `DirtyRecordTracker` by post-CRUD lifecycle behaviors added during `addEntity()`.

Each dirty record has:

| Field | Description |
|-------|-------------|
| `entity` | Entity name, e.g. `'Book'` |
| `id` | The record's primary key (may be negative for offline creates) |
| `operation` | `'create'`, `'update'`, or `'delete'` |
| `record` | Deep clone of the record at time of mutation |
| `timestamp` | `Date.now()` when the mutation was tracked |

The tracker coalesces mutations on the same key:

- **Create + Delete = no-op.** A record created and then deleted offline never existed on the server; remove from the log.
- **Create + Update = Create with latest data.** The server should see a single Create with the final edited state.

See [Sync Strategies](sync-strategies.md) for the full coalescing rules and the replay pattern.

## Cache-Through

**Cache-Through** is an opportunistic caching mode you enable with `provider.enableCacheThrough()`. When enabled, GET requests that fall through to the network (because the URL prefix matches but the record isn't in SQLite) have their successful responses ingested into SQLite before the response is handed back to the caller.

Cache-through has two safety rules:

1. **Dirty records are never overwritten.** If the local version is dirty (the tracker has a pending mutation for it), the network response is ignored. The local edit is authoritative until it syncs.
2. **Only the entity you're reading gets cached.** Related entities in a deep-join response aren't automatically cached.

Cache-through is what lets you transition gradually from "online app" to "offline-capable app" without changing how your code fetches data.

## Blob

A **Blob** is binary data (image, video, file, arbitrary byte stream) stored in `BlobStoreManager`. Blobs live outside the SQLite table — SQLite stores row data plus a key reference to the blob, and the blob itself lives in IndexedDB (or the delegate).

Blob keys follow the format `<EntityType>:<ID>:v<Version>` — for example `Artifact:3:v1`. This naming convention lets you look up "all binary versions of artifact 3" by prefix.

The provider intercepts binary calls (`postBinary`, `getBinaryBlob`, etc.) in the same way it intercepts JSON calls. When you upload an image offline, it goes into the blob store and a binary mutation is tracked in the dirty tracker. When you download an image offline, the blob is retrieved from storage and handed back as if it came from the network.

## Negative ID

A **Negative ID** is a primary-key value less than zero that the provider assigns to a record created offline. Because servers always return positive IDs, negative IDs give the client a guaranteed-unique range to create records in without risking collisions with server-side rows.

When cache-through enables negative IDs (`provider.enableNegativeIDs()`), the provider's Create-pre-operation behavior queries `MIN(ID)` from the entity's SQLite table and picks the next lower negative ID. On sync, `remapID(entity, oldID, newID)` updates the primary key and every foreign key that references it across all registered entities.

## The Big Picture

```
┌──────────────────────────────────────────────────────────┐
│                    Application                          │
│   (Pict views, models, controllers — unchanged)         │
└────────────────────────┬─────────────────────────────────┘
                         │ RestClient.getJSON / putJSON / ...
                         ▼
┌──────────────────────────────────────────────────────────┐
│             RestClient (wrapped executeJSONRequest)      │
└────────────────────────┬─────────────────────────────────┘
                         │
                  ┌──────┴──────┐
                  │  Interceptor │
                  └──────┬──────┘
          ┌──────────────┴──────────────┐
          │                             │
    Match prefix                   No match
          │                             │
          ▼                             ▼
  ┌──────────────┐              ┌──────────────┐
  │  IPC Orator  │              │   Original   │
  │   + meadow   │              │ RestClient → │
  │   endpoints  │              │     HTTP      │
  └──────┬───────┘              └──────────────┘
         │
         ▼
  ┌──────────────┐
  │   SQLite     │
  │  (sql.js)    │
  └──────┬───────┘
         │
         │ (mutations flow back to tracker)
         ▼
  ┌──────────────┐
  │ Dirty Tracker │
  │   (in-mem)    │
  └──────────────┘
```

The application never knows the difference. That's the whole point.
