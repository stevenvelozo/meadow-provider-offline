# addEntities

Register multiple Meadow entities in a single batch call. Faster than chaining `addEntity()` calls because it avoids per-entity microtask scheduling overhead.

## Signature

```javascript
addEntities(pSchemas, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pSchemas` | array | Array of Meadow package schema objects |
| `fCallback` | function | *Optional.* Callback with signature `(pError)`. Called once after all entities are registered, with the first error encountered (if any). |

**Returns:** nothing. Result delivered via callback.

## What It Does

1. Verifies the provider is initialized
2. If `pSchemas` is empty, calls the callback immediately with no error
3. Iterates through the schemas sequentially, calling `addEntity()` on each
4. Accumulates the first error encountered (if any) but continues the batch
5. When done, calls the callback with the first error or null

## Code Example: Bulk Registration

```javascript
const bookSchema = require('./schemas/Book.package.json');
const authorSchema = require('./schemas/Author.package.json');
const bookAuthorJoinSchema = require('./schemas/BookAuthorJoin.package.json');
const publisherSchema = require('./schemas/Publisher.package.json');
const reviewSchema = require('./schemas/Review.package.json');

tmpOffline.addEntities(
    [
        bookSchema,
        authorSchema,
        bookAuthorJoinSchema,
        publisherSchema,
        reviewSchema
    ],
    (pError) =>
    {
        if (pError)
        {
            console.error('One or more entities failed to register:', pError);
            return;
        }
        console.log('All entities registered:', tmpOffline.entityNames);
        // -> ['Book', 'Author', 'BookAuthorJoin', 'Publisher', 'Review']
    });
```

## Code Example: Loading Schemas From a Directory

```javascript
const libFS = require('fs');
const libPath = require('path');

function loadAllSchemas(pDir)
{
    return libFS.readdirSync(pDir)
        .filter((pFile) => pFile.endsWith('.package.json'))
        .map((pFile) => require(libPath.join(pDir, pFile)));
}

let tmpAllSchemas = loadAllSchemas('./schemas');

tmpOffline.addEntities(tmpAllSchemas, (pError) =>
{
    if (pError) throw pError;
    console.log(`Registered ${tmpOffline.entityNames.length} entities from schema directory`);
});
```

## Error Handling

Unlike sequential chaining, `addEntities()` **does not abort on the first error**. It continues through the whole array and calls the callback with the first error it saw. This is usually the right behavior -- one broken schema in a hundred shouldn't prevent the other ninety-nine from loading.

If you need "fail fast" semantics, use `addEntity()` in a sequential chain and bail out on the first error:

```javascript
function addEntitiesStrict(pOffline, pSchemas, fCallback)
{
    let tmpIndex = 0;
    let tmpNext = () =>
    {
        if (tmpIndex >= pSchemas.length) return fCallback(null);
        pOffline.addEntity(pSchemas[tmpIndex++], (pError) =>
        {
            if (pError) return fCallback(pError);
            tmpNext();
        });
    };
    tmpNext();
}
```

## Code Example: Registration Order

Order matters if you have entities that reference each other via `Join` columns -- but only for `remapID()` traversal, not for the initial table creation. SQLite doesn't enforce foreign keys unless you tell it to, and `addEntity()` doesn't tell it to.

Still, it's conventional to register in dependency order (parents before children):

```javascript
tmpOffline.addEntities(
    [
        // Parents first
        authorSchema,
        publisherSchema,
        // Then books (which reference authors and publishers)
        bookSchema,
        // Then joins and dependents
        bookAuthorJoinSchema,
        bookPublisherJoinSchema,
        reviewSchema,
        bookPriceSchema
    ]);
```

## Performance

For ten entities or fewer the difference is imperceptible. For fifty or more, `addEntities()` is noticeably faster than the chained alternative because:

- Each `addEntity()` call involves a microtask boundary (the async callback)
- Chained `addEntity()` calls wait for each microtask to resolve before starting the next
- `addEntities()` does the chaining synchronously within a single call frame

For a hundred entities:
- Chained: ~50-100ms of microtask overhead
- `addEntities`: negligible

## Related

- [addEntity](api-addEntity.md) -- the single-entity version; used internally by this method
- [Entity Schema](entity-schema.md) -- the schema format each array element must follow
- [getEntity](api-getEntity.md) -- inspect a registered entity after batch registration
