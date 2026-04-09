# getEntity

Retrieve a registered entity by name. Returns the entity's DAL, meadow-endpoints, and schema, or `undefined` if the entity isn't registered.

## Signature

```javascript
getEntity(pEntityName)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntityName` | string | The entity's `Scope` (name) |

**Returns:** `{ dal, endpoints, schema }` or `undefined`.

## What It Returns

```javascript
{
    dal: /* meadow DAL instance */,
    endpoints: /* meadow-endpoints instance */,
    schema: /* the original package schema you passed to addEntity */
}
```

## Code Example: Basic Usage

```javascript
let tmpEntity = tmpOffline.getEntity('Book');

if (!tmpEntity)
{
    console.error('Book entity is not registered');
    return;
}

console.log('Scope:', tmpEntity.schema.Scope);
console.log('ID field:', tmpEntity.schema.DefaultIdentifier);
console.log('Columns:', tmpEntity.schema.Schema.map((pCol) => pCol.Column));
```

## Code Example: Executing a Direct meadow DAL Query

```javascript
let tmpEntity = tmpOffline.getEntity('Book');

// Use the DAL directly, bypassing the IPC server
tmpEntity.dal.doReads('FBV~Title~EQ~"Breakfast of Champions"', 0, 10,
    (pError, pQuery, pRecords) =>
    {
        if (pError) return console.error(pError);
        console.log('Found:', pRecords);
    });
```

This is how tests and debug tooling reach into the data layer directly. In normal app code you'd use the intercepted `RestClient` — `RestClient.getJSON('/1.0/Books/...')` — which routes through the same DAL under the hood.

## Code Example: Inspecting the Endpoint Route Names

```javascript
let tmpEntity = tmpOffline.getEntity('Book');
console.log('Version:', tmpEntity.endpoints.EndpointVersion);  // → '1.0'
console.log('Name:', tmpEntity.endpoints.EndpointName);         // → 'Book' or 'Books'
```

This is how the provider derives the URL prefixes it registers with the interceptor.

## Code Example: Iterating All Entities

Combine `entityNames` with `getEntity()`:

```javascript
for (let tmpName of tmpOffline.entityNames)
{
    let tmpEntity = tmpOffline.getEntity(tmpName);
    console.log(
        `${tmpName}: ${tmpEntity.schema.Schema.length} columns, ` +
        `ID=${tmpEntity.schema.DefaultIdentifier}`);
}
```

## Code Example: Checking Registration Before an Operation

```javascript
function safeSeed(pOffline, pName, pRecords)
{
    if (!pOffline.getEntity(pName))
    {
        console.warn(`Cannot seed ${pName}: not registered`);
        return;
    }
    pOffline.seedEntity(pName, pRecords);
}
```

## Returns `undefined` — Not `null`

`getEntity()` reads from a plain object (`this._Entities[name]`). Missing keys produce `undefined`, not `null`. Always check with `!tmpEntity` or `typeof tmpEntity !== 'undefined'`:

```javascript
let tmpEntity = tmpOffline.getEntity('NonExistent');
console.log(typeof tmpEntity);  // → 'undefined'
console.log(tmpEntity === undefined);  // → true
console.log(tmpEntity === null);  // → false
```

## Mutating the Returned Object

The returned object is a reference to the provider's internal state. Mutating it directly (e.g., adding fields to the DAL or swapping out the schema) will affect the provider's behavior.

In most cases you want to treat the result as read-only. If you need to modify the DAL (e.g., to patch a behavior), do it through `dal.setBehavior('Create', fn)` rather than reassigning properties on the returned object.

## Related

- [addEntity](api-addEntity.md) — the operation that creates what `getEntity` returns
- [removeEntity](api-removeEntity.md) — after this, `getEntity` returns `undefined`
- `provider.entityNames` — list of all currently-registered entity names
- [Entity Schema](entity-schema.md) — the format of `schema` in the returned object
