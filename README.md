# PlutoWeb

A lightweight browser client for SimpMusic. PlutoWeb is a separate web application and does not modify the Android app.

## Goals

- Reproduce the familiar SimpMusic listening workflow in a responsive browser UI.
- Keep the client lightweight: React, TypeScript, Vite and native browser audio.
- Keep playback, queue, search, lyrics, library and recommendation logic behind small adapters.
- Reuse the same YouTube Music / Spotify data sources and port SimpMusic algorithms where browser access permits.

## Important architecture note

SimpMusic's existing core is Kotlin and is not directly executable in a browser. PlutoWeb must port the relevant algorithms and API request/signing logic to TypeScript, or call a browser-accessible service for operations that cannot run in the browser. YouTube Music's internal endpoints are not a stable public API and may reject cross-origin browser requests. Do not silently introduce a third-party proxy or claim full parity until the request path has been verified.

## Development

```bash
npm install
npm run dev
npm run build
```

## Status

Initial application scaffold. API adapters are intentionally isolated so the browser request strategy can be verified without coupling it to the UI.
