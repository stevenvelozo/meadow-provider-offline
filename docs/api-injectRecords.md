# injectRecords

Alias for [`seedEntity`](api-seedEntity.md) with a different name that signals intent. Use `injectRecords` when the records come from an external source — a native app wrapper, a file import, a test fixture — rather than from a prior server fetch.

## Signature

```javascript
injectRecords(pEntityName, pRecords, fCallback)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pEntityName` | string | The entity's `Scope` (must already be registered) |
| `pRecords` | array | Array of record objects |
| `fCallback` | function | *Optional.* Callback with signature `(pError)` |

**Returns:** nothing. Result delivered via callback.

## Semantic Difference from seedEntity

There's no functional difference. `injectRecords` calls `seedEntity` internally. The difference is intent:

- **`seedEntity`** — "I'm loading a known set of records, probably fetched from the server before we went offline."
- **`injectRecords`** — "Some external source (a native app wrapper, a file, a test) is handing me a record set to inject into the cache."

Both clear the table and insert the new records. Both are no-ops in native bridge mode.

## Code Example: Native App Injection

The canonical use case — a native iOS or Android wrapper passes data into the webview for the browser-side app to consume:

```javascript
// Swift side (iOS WKWebView):
//
//   webView.evaluateJavaScript("""
//       window.meadowOffline.injectRecords('Book', \(booksJSON), () => {})
//   """)

// JavaScript side:
window.meadowOffline = tmpOffline;

// When the native side runs the JS above, this gets called:
//   tmpOffline.injectRecords('Book', [{IDBook:1,...}, ...], () => { ... })
```

## Code Example: Test Fixtures

In unit tests, injection is clearer than "seeding" because the records aren't a snapshot from anywhere:

```javascript
const fixtureBooks =
    [
        { IDBook: 1, Title: 'Fixture Book 1' },
        { IDBook: 2, Title: 'Fixture Book 2' }
    ];

test('query returns seeded books', (done) =>
{
    tmpOffline.injectRecords('Book', fixtureBooks, () =>
    {
        _Fable.RestClient.getJSON('/1.0/Books/0/10', (pError, pRes, pBody) =>
        {
            expect(pBody).toHaveLength(2);
            done();
        });
    });
});
```

## Code Example: Loading From a Local File

```javascript
const libFS = require('fs');

let tmpBooks = JSON.parse(libFS.readFileSync('./fixtures/books.json', 'utf8'));
tmpOffline.injectRecords('Book', tmpBooks);
```

## When to Use Which

| Situation | Method |
|-----------|--------|
| Records from server fetch before going offline | `seedEntity` |
| Records from native app bridge | `injectRecords` |
| Records from a test fixture | `injectRecords` |
| Records from a file import (CSV, JSON) | `injectRecords` |
| Resetting to a known good state during development | either |

Either method works in every situation — pick the one that makes your code read clearly. The provider doesn't care which name you use.

## Related

- [seedEntity](api-seedEntity.md) — the underlying method (this is just an alias)
- [addEntity](api-addEntity.md) — must be called first
