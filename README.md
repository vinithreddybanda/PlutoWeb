# PlutoWeb

A browser-first music client inspired by SimpMusic. Built with React, TypeScript, Vite and the native HTML audio element.

## Music sources

- **Audius** is the primary browser-native catalogue and streaming provider. Search and recommendations use the Audius public API; audio is played through its stream endpoint.
- **YouTube Music** remains an optional adapter and retains the WEB_REMIX queue/automix parsing port. Its internal endpoints are not a public API and may be blocked by browser CORS. Direct stream URLs can also require signature deciphering or PO-token handling, which this static browser build does not bypass.

The provider registry separates search, stream resolution and next-track discovery. Additional providers can be added without coupling them to the player UI.

## Playback

- Native browser audio with Media Session metadata and lock-screen controls.
- Persistent liked songs and queue.
- Next-track pre-resolution for the first two queued tracks, with fresh resolution on playback failure.
- Previous-track history, seeking, volume, and queue editing.
- Audius similar-track discovery; YouTube Music automix queue logic remains available for YouTube-origin tracks.

## Development

```bash
npm install
npm run dev
npm run build
```

## Hosting and limitations

The application is static and deploys to GitHub Pages. It does not run a server, proxy, or room coordinator. Browser CORS and provider-side rate limits still apply. Audius catalogue availability differs from mainstream commercial catalogues, and no provider guarantees every track is streamable in every browser.

OpenJam-style synchronized rooms require a separate realtime service and are intentionally not simulated with local-only state.
