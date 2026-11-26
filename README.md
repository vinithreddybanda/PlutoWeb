# PlutoWeb

A browser-first music client inspired by SimpMusic. Built with React, TypeScript, Vite and the native HTML audio element.

## Music sources

- **YouTube**: search uses the official YouTube Data API v3. Playback uses YouTube's official IFrame Player API, so audio stays inside YouTube's player and its playback, attribution, and content restrictions.
- **Audius**: direct browser streaming through the public Audius API. Audius is the fallback when YouTube search is unavailable or returns no results.

YouTube videos that are not embeddable, region-restricted, private, age-restricted, or otherwise unavailable may not play. The app filters search results to embeddable videos, but YouTube remains the authority at playback time.

## GitHub Pages setup

GitHub Pages is static hosting. It cannot run a private backend, bypass browser CORS, or safely extract and host YouTube audio. PlutoWeb therefore uses the official browser APIs and needs no proxy server.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project.
2. Enable **YouTube Data API v3**.
3. Create an API key. Restrict it to the YouTube Data API v3 and to your deployed website's HTTP referrers (for example, `https://vinithreddybanda.github.io/*`). If the project is deployed under a repository subpath, the referrer still uses the same host.
4. In GitHub, open **Settings → Secrets and variables → Actions → Variables**.
5. Add `VITE_YOUTUBE_API_KEY` with the API key as its value.
6. Run **Deploy PlutoWeb** from Actions, or push a commit to `main`.

Vite embeds this variable at build time. Changing the variable requires a new Pages build. The API key is visible in the browser by design for this client-side integration, so apply API and HTTP-referrer restrictions in Google Cloud.

The YouTube Data API has quota limits. A search request consumes quota, so avoid rapid repeated searches. The API provides video search, not the complete YouTube Music catalogue; results are YouTube videos matching the query.

## Playback

- YouTube videos play through the visible, official YouTube embedded player.
- Audius tracks use the native audio player.
- Liked tracks and the queue are stored locally.
- Media Session controls are available for native audio playback; embedded YouTube playback remains subject to browser and YouTube player controls.
- Some YouTube videos cannot be embedded. Try another result when YouTube reports that a video is unavailable.

## Development

```bash
npm install
npm run dev
npm run build
```

For local development, set `VITE_YOUTUBE_API_KEY` in a local `.env` file (do not commit it), then run `npm run dev`.

## Why there is no YouTube audio extractor

PlutoWeb does not download, re-host, proxy, or extract YouTube audio streams. A CORS proxy only changes where a browser request originates; it does not grant permission to access protected media, create PO tokens, or make every video playable. Using YouTube's embedded player is the supported route for YouTube playback. Direct audio streaming remains available from sources that authorize it, such as Audius.
