import type { SearchResult, Track } from "./types";
import { audiusProvider, type MusicProvider } from "./core/providers";

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || "";
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

type YouTubeVideo = {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } };
    publishedAt?: string;
  };
};

async function youtubeSearch(query: string): Promise<Track[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YouTube search needs a YouTube Data API key. Add VITE_YOUTUBE_API_KEY in GitHub Actions Variables and redeploy Pages.");
  }
  const params = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: "snippet",
    type: "video",
    maxResults: "25",
    q: query,
    videoEmbeddable: "true",
    safeSearch: "none"
  });
  const response = await fetch(`${YOUTUBE_API}/search?${params}`);
  const data = await response.json() as { items?: YouTubeVideo[]; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `YouTube search failed (${response.status}).`);
  return (data.items || []).flatMap(item => {
    const videoId = item.id?.videoId;
    if (!videoId) return [];
    const snippet = item.snippet;
    return [{
      videoId,
      title: snippet.title,
      artists: snippet.channelTitle,
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
      source: "youtube" as const
    }];
  });
}

export class YouTubeMusicProvider implements MusicProvider {
  readonly id = "youtube";
  async search(query: string): Promise<SearchResult> {
    return { tracks: await youtubeSearch(query) };
  }
  async next(track: Track): Promise<Track[]> {
    const results = await youtubeSearch(`${track.artists} ${track.title} official audio`);
    return results.filter(item => item.videoId !== track.videoId).slice(0, 12);
  }
  stream(_track: Track): string {
    throw new Error("YouTube tracks play through the official embedded YouTube player, not extracted audio URLs.");
  }
}

export class MusicProviderRegistry {
  private providers = new Map<string, MusicProvider>();
  constructor(...providers: MusicProvider[]) { providers.forEach(provider => this.providers.set(provider.id, provider)); }
  get(source?: string): MusicProvider {
    const provider = this.providers.get(source || "audius");
    if (!provider) throw new Error(`Music source "${source}" is not registered.`);
    return provider;
  }
}
export const youtubeProvider = new YouTubeMusicProvider();
export const providerRegistry = new MusicProviderRegistry(audiusProvider, youtubeProvider);

export class PlutoMusicApi {
  async search(query: string): Promise<SearchResult> {
    try {
      const result = await youtubeProvider.search(query);
      if (result.tracks.length) return result;
    } catch (youtubeError) {
      try {
        const fallback = await audiusProvider.search(query);
        if (fallback.tracks.length) return fallback;
        throw youtubeError;
      } catch (audiusError) {
        const yt = youtubeError instanceof Error ? youtubeError.message : "YouTube search failed.";
        const au = audiusError instanceof Error ? audiusError.message : "Audius search failed.";
        throw new Error(`${yt} Audius fallback: ${au}`);
      }
    }
    return audiusProvider.search(query);
  }
  private sourceOf(track: Track): "audius" | "youtube" {
    if (track.source) return track.source;
    return track.videoId.startsWith("audius:") ? "audius" : "youtube";
  }
  async stream(track: Track): Promise<string> {
    return providerRegistry.get(this.sourceOf(track)).stream(track);
  }
  async next(track: Track): Promise<Track[]> {
    return this.sourceOf(track) === "youtube"
      ? youtubeProvider.next(track)
      : audiusProvider.next(track);
  }
  resetRadioQueue() {}
}
export const musicApi = new PlutoMusicApi();
