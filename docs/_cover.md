# Meadow Provider Offline

> Offline-capable Meadow provider with browser-side SQLite and transparent RestClient interception

- Intercepts meadow REST calls and routes them to in-process SQLite via IPC
- Full CRUD via `meadow-endpoints`: Create, Read, Reads, Update, Delete, Count
- Dirty record tracking with intelligent coalescing
- Cache-through for fall-through GETs; negative-ID assignment for offline creates
- Native bridge to replace sql.js on mobile; IndexedDB blob storage for binary data

[GitHub](https://github.com/stevenvelozo/meadow-provider-offline)
[Get Started](#meadow-provider-offline)
