# PlutoWeb

A browser-first music client inspired by SimpMusic. Built with React, TypeScript, Vite and the native HTML audio element.

## Music sources

- **Audius** works directly from the browser through its public API.
- **YouTube Music** uses the WEB_REMIX InnerTube catalogue and queue endpoints through a small server-side bridge. Audio URL resolution is delegated to the current `yt-dlp` release, rather than assuming every InnerTube player response contains a ready-to-play URL.
- The YouTube bridge is an unofficial integration with YouTube's internal endpoints. Those endpoints and extraction requirements can change; availability is not guaranteed.

## YouTube bridge deployment

GitHub Pages is static, so it cannot safely run the YouTube API calls or `yt-dlp`. Deploy the included bridge as a separate service:

1. Open [Render](https://render.com/) and create a new Blueprint from this repository. Render detects `render.yaml` and builds `server/Dockerfile`.
2. Wait for the service health check at `/health` to pass, then copy its public service URL.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables** and add `VITE_YTMUSIC_API_URL` with the Render service URL (no trailing slash).
4. Run the **Deploy PlutoWeb** workflow again, or push a new commit. Vite embeds this variable into the static frontend at build time.

The bridge exposes only the required `search`, `next`, `browse`, `player`, and audio-resolution routes. It does not accept arbitrary upstream URLs. `YT_PO_TOKEN` is an optional Render environment variable for deployments where yt-dlp reports that a PO token is required; use a token generated for the matching client/context and keep it private.

The Render free instance may sleep when idle, so the first YouTube request can take longer after inactivity. For reliable always-on playback, use an always-on host. Do not commit cookies, PO tokens, or other credentials to this repository.

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

For local YouTube playback, run the bridge from `server/` using Docker and set `VITE_YTMUSIC_API_URL` to its local URL before starting/building Vite. Without that variable, the app retains its browser-direct fallback, which may be blocked by CORS and may not resolve protected audio formats.

## Hosting and limitations

The frontend deploys to GitHub Pages. The bridge is a separate service and is not deployed by the Pages workflow. YouTube may change its internal API, require additional verification, or restrict requests by IP or region. This project does not guarantee uninterrupted access to every track. Audius remains available as a separate source.

OpenJam-style synchronized rooms require a separate realtime service and are intentionally not simulated with local-only state.
