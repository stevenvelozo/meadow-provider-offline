# Entity Schema

Entities in Meadow Provider Offline are registered using **Meadow package schema objects** -- the same JSON format produced by `meadow-schema-pkg` and consumed by `Meadow.loadFromPackageObject()`. This page documents the schema format, the column types the provider supports, and how to hand-write a schema when you don't have one pre-built.

## Top-Level Shape

```javascript
{
    Scope: 'Book',
    DefaultIdentifier: 'IDBook',
    Schema:
        [
            { Column: 'IDBook', Type: 'AutoIdentity' },
            { Column: 'GUIDBook', Type: 'AutoGUID' },
            { Column: 'Title', Type: 'String' },
            { Column: 'CreateDate', Type: 'CreateDate' },
            { Column: 'CreatingIDUser', Type: 'CreateIDUser' },
            { Column: 'UpdateDate', Type: 'UpdateDate' },
            { Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
            { Column: 'Deleted', Type: 'Deleted' }
        ],
    DefaultObject:
    {
        IDBook: null,
        GUIDBook: '',
        Title: 'Unknown',
        CreateDate: null,
        CreatingIDUser: 0,
        UpdateDate: null,
        UpdatingIDUser: 0,
        Deleted: 0
    },
    JsonSchema:
    {
        title: 'Book',
        type: 'object',
        properties:
        {
            IDBook: { type: 'integer' },
            GUIDBook: { type: 'string' },
            Title: { type: 'string' }
        }
    },
    Authorization:
    {
        Administrator: { Create: 'Allow', Read: 'Allow', Update: 'Allow', Delete: 'Allow' },
        User: { Create: 'Allow', Read: 'Allow', Update: 'Deny', Delete: 'Deny' }
    }
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `Scope` | string | The entity name. Used as the SQLite table name, the meadow-endpoints route prefix (after pluralisation), and the key in `provider._Entities`. |
| `Schema` | array | Column definitions. See [Column Types](#column-types) below. |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `DefaultIdentifier` | string | Name of the primary key column. Defaults to `ID<Scope>`. Used by `seedEntity`, cache-through dedup, dirty tracking, and negative-ID remapping. |
| `DefaultObject` | object | Default record shape for new Creates. Used by `meadow-endpoints` when no body is posted. |
| `JsonSchema` | object | JSON Schema used by `meadow-endpoints` for request validation. |
| `Authorization` | object | Per-role permission map. Because the provider bypasses session auth by default, this is mostly advisory in browser mode. |

## Column Types

Column types come from meadow's type system. The provider's `DataCacheManager.convertPackageSchemaToTableSchema()` maps them to SQLite DDL types:

| Meadow Type | SQLite Type | Notes |
|-------------|-------------|-------|
| `AutoIdentity` | `INTEGER PRIMARY KEY AUTOINCREMENT` | The primary key. Exactly one per table. |
| `AutoGUID` | `TEXT` | Auto-populated GUID on Create. |
| `String` | `TEXT` | Variable-length string. |
| `Text` | `TEXT` | Longer text content. |
| `Integer` | `INTEGER` | Whole number. |
| `Decimal` | `REAL` | Floating-point value. |
| `Boolean` | `INTEGER` | Stored as 0 or 1. |
| `DateTime` | `TEXT` | ISO 8601 strings. |
| `CreateDate` | `TEXT` | Auto-populated on Create. |
| `UpdateDate` | `TEXT` | Auto-populated on Update. |
| `DeleteDate` | `TEXT` | Auto-populated on Delete. |
| `CreateIDUser` | `INTEGER` | Auto-populated with session user ID on Create. |
| `UpdateIDUser` | `INTEGER` | Auto-populated with session user ID on Update. |
| `DeleteIDUser` | `INTEGER` | Auto-populated with session user ID on Delete. |
| `Deleted` | `INTEGER` | Soft-delete flag (0 / 1). |

Any unknown `Type` defaults to `TEXT`. Unknown column types are passed through by meadow itself -- for custom types you can trust meadow to handle them consistently.

## Hand-Writing a Schema

If you don't have a pre-built schema, here's a minimal one for a `Note` entity:

```javascript
const noteSchema =
{
    Scope: 'Note',
    DefaultIdentifier: 'IDNote',
    Schema:
        [
            { Column: 'IDNote', Type: 'AutoIdentity' },
            { Column: 'GUIDNote', Type: 'AutoGUID' },
            { Column: 'Title', Type: 'String' },
            { Column: 'Body', Type: 'Text' },
            { Column: 'CreateDate', Type: 'CreateDate' },
            { Column: 'CreatingIDUser', Type: 'CreateIDUser' },
            { Column: 'UpdateDate', Type: 'UpdateDate' },
            { Column: 'UpdatingIDUser', Type: 'UpdateIDUser' },
            { Column: 'Deleted', Type: 'Deleted' }
        ],
    DefaultObject:
    {
        IDNote: null,
        GUIDNote: '',
        Title: '',
        Body: '',
        CreateDate: null,
        CreatingIDUser: 0,
        UpdateDate: null,
        UpdatingIDUser: 0,
        Deleted: 0
    }
};

tmpOffline.addEntity(noteSchema);
```

This gives you an offline `Note` entity with full CRUD. The audit columns (`CreateDate`, `CreatingIDUser`, `UpdateDate`, `UpdatingIDUser`, `Deleted`) are boilerplate but recommended for real apps -- meadow and meadow-endpoints know about them and will populate them automatically on the appropriate lifecycle events.

## Foreign Keys

Foreign keys are declared via a `Join` property on the column:

```javascript
{ Column: 'IDBook', Type: 'Integer', Join: 'IDBook' }
```

The provider doesn't enforce foreign keys at the SQLite level, but `remapID()` follows them across tables during sync. When a record's primary key changes from an offline negative ID to a server positive ID, `remapID` walks every registered entity looking for columns that reference the old ID and updates them.

## Resulting SQL

Calling `addEntity()` on the `Note` schema above creates roughly this SQL:

```sql
CREATE TABLE IF NOT EXISTS Note (
    IDNote INTEGER PRIMARY KEY AUTOINCREMENT,
    GUIDNote TEXT,
    Title TEXT,
    Body TEXT,
    CreateDate TEXT,
    CreatingIDUser INTEGER,
    UpdateDate TEXT,
    UpdatingIDUser INTEGER,
    Deleted INTEGER
);
```

The `CREATE TABLE IF NOT EXISTS` clause means re-running `addEntity()` with the same schema is idempotent at the SQL level (though the provider rejects duplicate entity registrations at the JavaScript level with a warning).

## Multiple Entities

Most real applications have many entities. Use `addEntities()` to register them in one call:

```javascript
tmpOffline.addEntities(
    [
        bookSchema,
        authorSchema,
        bookAuthorJoinSchema,
        publisherSchema
    ],
    (pError) =>
    {
        if (pError) throw pError;
        tmpOffline.connect(_Fable.RestClient);
    });
```

`addEntities()` is faster than a sequential loop of `addEntity()` calls because it avoids per-entity microtask scheduling.

## Debugging

After registering entities, inspect the provider to verify everything is wired up:

```javascript
console.log('Entity names:', tmpOffline.entityNames);
// -> [ 'Book', 'Author', 'BookAuthorJoin', 'Publisher' ]

let tmpBookEntity = tmpOffline.getEntity('Book');
console.log('Book DAL:', tmpBookEntity.dal);
console.log('Book endpoints:', tmpBookEntity.endpoints);
console.log('Book schema:', tmpBookEntity.schema);

// Check the SQLite table exists
let tmpRows = tmpOffline.dataCacheManager.db.prepare('SELECT * FROM Book LIMIT 5').all();
console.log('First 5 books:', tmpRows);
```
