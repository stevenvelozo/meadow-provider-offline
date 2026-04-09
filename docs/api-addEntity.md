# addEntity

Register a single Meadow entity with the provider. Creates the DAL, sets the SQLite provider, creates MeadowEndpoints, adds dirty-tracking behaviors, creates the SQLite table, and registers URL prefixes for interception.

## Signature

```javascript
addEntity(pSchema, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pSchema` | object | Meadow package schema object with at minimum `Scope` and `Schema` fields. See [Entity Schema](entity-schema.md) for the full format. |
| `fCallback` | function | *Optional.* Callback with signature `(pError)`. If omitted, a no-op callback is used. |

**Returns:** nothing. Result delivered via callback.

## What It Does

For each `addEntity()` call:

1. Verifies the provider is initialized
2. Verifies the schema has a `Scope` property
3. Verifies the entity isn't already registered (warns if so, skips)
4. Creates a `meadow` DAL via `libMeadow.new(fable).loadFromPackageObject(pSchema)`
5. Points the DAL at the `SQLite` provider (or a native bridge if one is set)
6. Creates `meadow-endpoints` for the DAL
7. Adds post-Create / post-Update / post-Delete behaviors that call `dirtyTracker.trackMutation(...)`
8. Patches the Update endpoint to accept negative IDs (always applied — harmless if `enableNegativeIDs` isn't active)
9. Connects the endpoint routes to the IPC Orator server
10. Registers the URL prefix (`/1.0/<Scope>`) with the interceptor
11. If not using native bridge: creates the SQLite table via `CREATE TABLE IF NOT EXISTS`
12. Stores the entity in `provider._Entities[Scope]` and appends to `entityNames`
13. Calls the callback

## Code Example: Basic Usage

```javascript
const bookSchema = require('./schemas/Book.package.json');

tmpOffline.addEntity(bookSchema, (pError) =>
{
    if (pError)
    {
        console.error('Failed to register Book:', pError);
        return;
    }

    console.log('Book entity registered');
    console.log('Known entities:', tmpOffline.entityNames);
});
```

## Code Example: Without Callback

The callback is optional. If you don't need to know when registration completes (often because the SQLite table creation is synchronous anyway when using sql.js), you can skip it:

```javascript
tmpOffline.addEntity(bookSchema);
// Entity is synchronously available — safe to use immediately in sql.js mode
tmpOffline.seedEntity('Book', [{ IDBook: 1, Title: 'Example' }]);
```

Note: if you're using a **native bridge**, table creation is skipped entirely (the native host manages the schema), so synchronous access is always fine.

## Code Example: Chained Registration

Before `addEntities()` existed, people would chain `addEntity()` calls:

```javascript
tmpOffline.addEntity(bookSchema, () =>
{
    tmpOffline.addEntity(authorSchema, () =>
    {
        tmpOffline.addEntity(bookAuthorJoinSchema, () =>
        {
            tmpOffline.connect(_Fable.RestClient);
        });
    });
});
```

This still works, but for more than a couple of entities use [addEntities](api-addEntities.md) instead — it's faster and produces cleaner code.

## Code Example: Inspecting the Result

After `addEntity()` returns, the entity is accessible via `getEntity()`:

```javascript
tmpOffline.addEntity(bookSchema, () =>
{
    let tmpEntity = tmpOffline.getEntity('Book');
    console.log('DAL:', tmpEntity.dal);
    console.log('Endpoints:', tmpEntity.endpoints);
    console.log('Endpoint route prefix:',
        `/${tmpEntity.endpoints.EndpointVersion}/${tmpEntity.endpoints.EndpointName}`);
    // → /1.0/Books
});
```

## URL Prefix Registration

The URL prefix that gets registered is derived from the endpoint's `EndpointVersion` and `EndpointName` properties:

```
/1.0/Books        ← the list / filter / count endpoints
/1.0/Book         ← the single-record endpoints (Create, Read, Update, Delete)
```

Meadow-endpoints uses the schema's `Scope` as the singular route and the pluralised form (`Scope + 's'`) as the plural route. The interceptor registers the shared prefix `/1.0/Book` (singular), which matches both plural (`/1.0/Books/...`) and singular (`/1.0/Book/42`) routes because prefix-matching is inclusive.

## Negative ID Patch

Every `addEntity()` call runs `_patchUpdateEndpointForNegativeIDs()` against the endpoints. This patches meadow-endpoints' Update route to accept primary keys that are negative numbers (which would otherwise fail meadow's default validation). The patch is always applied, regardless of whether `enableNegativeIDs()` has been called, because there's no harm in accepting negative IDs and the patch has to happen before `connectEntityRoutes()` binds the route handlers.

## Dirty Tracking Hooks

The behaviors added to the endpoints fire **after** meadow has committed the mutation to SQLite:

```
POST /1.0/Book → meadow.doCreate → SQLite INSERT → post-Create behavior → trackMutation
```

This ensures the tracker only sees mutations that actually persisted. If meadow throws or the SQL fails, the mutation is not tracked.

## Errors

| Error | Cause |
|-------|-------|
| `"Not initialized. Call initializeAsync() first."` | Called before `initializeAsync()` completed |
| `"Invalid schema — must have a Scope property."` | The schema doesn't have a `Scope` field |
| Table creation failure | SQLite DDL failure — passed through to the callback |

If the entity is already registered, a warning is logged and the callback is called with no error.

## Related

- [addEntities](api-addEntities.md) — faster batch registration for multiple schemas
- [removeEntity](api-removeEntity.md) — reverse operation (partial — SQLite table is not dropped)
- [getEntity](api-getEntity.md) — inspect a registered entity
- [Entity Schema](entity-schema.md) — the schema format this method accepts
- [seedEntity](api-seedEntity.md) — usually called right after `addEntity()` to populate data
