# Configuration Reference

All configuration is passed to the service provider constructor through `instantiateServiceProvider`'s options argument. There's no fable-settings fallback; if you want file-based config, load it yourself and pass it to the constructor.

```javascript
_Fable.serviceManager.addServiceType('MeadowProviderOffline', libMeadowProviderOffline);

const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
        SessionDataSource: 'None',
        DefaultSessionObject: { UserID: 1, UserRole: 'User', UserRoleIndex: 1, LoggedIn: true },
        MeadowEndpoints: { ServerProtocol: 'https', ServerAddress: 'api.example.com', ServerPort: 443 }
    });
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `SessionDataSource` | string | `'None'` | Value written to `fable.settings.MeadowEndpointsSessionDataSource`. Tells meadow-endpoints where to read session state from. `'None'` bypasses session authentication entirely -- appropriate for browser-side offline mode. |
| `DefaultSessionObject` | object | default user session | Value written to `fable.settings.MeadowEndpointsDefaultSessionObject`. The session object meadow-endpoints uses when `SessionDataSource` is `'None'`. Must have at minimum `UserID`, `UserRole`, `UserRoleIndex`, and `LoggedIn`. See [Default Session Object](#default-session-object) for the fallback shape. |
| `MeadowEndpoints` | object | *(none)* | Optional `MeadowEndpoints` provider URL configuration. Written directly to `fable.settings.MeadowEndpoints`. Usually unused in browser-offline mode, but exposed for cases where your in-memory endpoints need to know about a "real" server for some of their behaviors. |

### Default Session Object

If `DefaultSessionObject` is not provided, the provider falls back to:

```javascript
{
    CustomerID: 1,
    SessionID: 'browser-offline',
    DeviceID: 'Browser',
    UserID: 1,
    UserRole: 'User',
    UserRoleIndex: 1,
    LoggedIn: true
}
```

For meadow-endpoints to treat the browser user as fully authorized, you typically want `UserRole: 'Administrator'` with `UserRoleIndex: 255` (or whatever your highest privilege level is):

```javascript
{
    CustomerID: 1,
    SessionID: 'browser-offline',
    DeviceID: 'Browser',
    UserID: 1,
    UserRole: 'Administrator',
    UserRoleIndex: 255,
    LoggedIn: true
}
```

The session object is applied to `fable.settings` **before** any `addEntity()` call, which means any `meadow-endpoints` instance created during entity registration will pick it up automatically.

## Fable Settings Consumed Indirectly

The provider writes these keys into `fable.settings` during `_applySessionConfig()`:

| Key | Source |
|-----|--------|
| `fable.settings.MeadowEndpointsSessionDataSource` | `options.SessionDataSource` (default `'None'`) |
| `fable.settings.MeadowEndpointsDefaultSessionObject` | `options.DefaultSessionObject` (default shown above) |
| `fable.settings.MeadowEndpoints` | `options.MeadowEndpoints` (only if present) |

You can inspect these after instantiation to confirm the values:

```javascript
console.log(_Fable.settings.MeadowEndpointsDefaultSessionObject);
```

## Runtime Flags

A few knobs are controlled through methods on the provider rather than constructor options:

| Flag | Method | Default |
|------|--------|---------|
| Cache-through mode | `enableCacheThrough()` / `disableCacheThrough()` | off |
| Negative ID assignment | `enableNegativeIDs()` / `disableNegativeIDs()` | off |
| Native bridge | `setNativeBridge(fn)` -- call **before** `initializeAsync()` | unset (uses sql.js) |
| Blob storage delegate | `blobStore.setStorageDelegate(delegate)` | unset (uses IndexedDB) |

These are separate from constructor options because they often depend on decisions made after other services have been wired up (e.g., whether a native host is present, whether a particular entity needs negative IDs).

## Example: Production Browser Configuration

```javascript
_Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
        SessionDataSource: 'None',
        DefaultSessionObject:
        {
            CustomerID: 1,
            SessionID: 'browser-offline-' + Date.now(),
            DeviceID: navigator.userAgent,
            UserID: window.currentUser.IDUser,
            UserRole: window.currentUser.Role,
            UserRoleIndex: window.currentUser.RoleIndex,
            LoggedIn: true
        }
    });
```

Pulling the session from your app's current-user state ensures offline mutations get the same auditing (`CreatingIDUser`, `UpdatingIDUser`) as online ones.

## Example: Test Configuration

```javascript
_Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
        SessionDataSource: 'None',
        DefaultSessionObject: { UserID: 1, UserRole: 'Administrator', UserRoleIndex: 255, LoggedIn: true }
    });
```

Minimum viable config for unit tests. Add the test-specific native bridge or blob delegate after instantiation but before `initializeAsync()`.

## Example: Native-Bridge Configuration

```javascript
const tmpOffline = _Fable.serviceManager.instantiateServiceProvider('MeadowProviderOffline',
    {
        SessionDataSource: 'None',
        DefaultSessionObject: { UserID: 1, UserRole: 'Administrator', UserRoleIndex: 255, LoggedIn: true }
    });

// Set the bridge BEFORE initializeAsync -- this tells the provider to skip sql.js
tmpOffline.setNativeBridge(myNativeBridgeFunction);

// Optional: set a blob delegate too
tmpOffline.blobStore.setStorageDelegate(myBlobDelegate);

tmpOffline.initializeAsync((pError) =>
{
    if (pError) throw pError;
    // ... rest of setup
});
```

See [Native Bridge](native-bridge.md) for the full walkthrough.
