import type { SearchResult, Track } from "./types";
import { innertubePost } from "./core/innertube";
import { audiusProvider, type MusicProvider } from "./core/providers";
import { continueQueue, getRelatedTracks, getRadioQueue, type QueuePage } from "./core/queue";

type AnyRecord = Record<string, any>;
function text(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(text).join("");
  return value.simpleText ?? value.runs?.map((run: AnyRecord) => run.text).join("") ?? "";
}
function walk(value: any, visit: (node: AnyRecord) => void) {
  if (!value || typeof value !== "object") return;
  visit(value);
  if (Array.isArray(value)) value.forEach(item => walk(item, visit));
  else Object.values(value).forEach(item => walk(item, visit));
}
function parseTracks(data: any): Track[] {
  const found = new Map<string, Track>();
  walk(data, node => {
    const renderer = node.musicResponsiveListItemRenderer ?? node.musicTwoRowItemRenderer ??
      node.playlistPanelVideoRenderer ?? node.compactVideoRenderer;
    if (!renderer) return;
    const videoId = renderer.playlistItemData?.videoId ?? renderer.videoId;
    if (!videoId || found.has(videoId)) return;
    const flex = renderer.flexColumns ?? [];
    const title = text(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text) || text(renderer.title) || "Unknown track";
    const artists = text(flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text) || text(renderer.shortBylineText) || "Unknown artist";
    const thumbs = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? renderer.thumbnail?.thumbnails ?? [];
    const duration = text(renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text) || text(renderer.lengthText);
    found.set(videoId, {
      videoId, title, artists, thumbnail: thumbs.at(-1)?.url, duration: duration || undefined,
      playlistId: renderer.playlistId, source: "youtube",
      musicVideoType: renderer.navigationEndpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType,
      isLive: (renderer.badges ?? []).some((badge: AnyRecord) => Boolean(badge.liveBadgeRenderer))
    });
  });
  return [...found.values()];
}

export class YouTubeMusicProvider implements MusicProvider {
  readonly id = "youtube";
  private radioAudioOnly = false;
  private activeRadioPage: QueuePage | null = null;
  resetRadioQueue() { this.activeRadioPage = null; }
  setRadioAudioOnly(enabled: boolean) { this.radioAudioOnly = enabled; }
  async search(query: string): Promise<SearchResult> {
    const data = await innertubePost<AnyRecord>("search", { query, params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D" });
    return { tracks: parseTracks(data) };
  }
  async next(track: Track): Promise<Track[]> {
    if (this.activeRadioPage?.continuation) {
      const page = await continueQueue(this.activeRadioPage);
      this.activeRadioPage = page;
      return page.items;
    }
    const result = await getRelatedTracks(track.videoId, this.radioAudioOnly);
    this.activeRadioPage = result.page;
    return result.tracks;
  }
  async radio(videoId: string): Promise<QueuePage> { return getRadioQueue(videoId); }
  async continueRadio(page: QueuePage): Promise<QueuePage> { return continueQueue(page); }
  async stream(track: Track): Promise<string> {
    const data = await innertubePost<AnyRecord>("player", {
      videoId: track.videoId, playbackContext: { contentPlaybackContext: { signatureTimestamp: 0 } }
    });
    const formats = [...(data.streamingData?.adaptiveFormats ?? []), ...(data.streamingData?.formats ?? [])];
    const audio = formats.filter((x: AnyRecord) => x.mimeType?.startsWith("audio/") && Boolean(x.url))
      .sort((a: AnyRecord, b: AnyRecord) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    if (!audio?.url) throw new Error("YouTube did not return a direct audio URL. Signature deciphering and PO-token handling are not available in this browser build.");
    return audio.url;
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
      const result = await audiusProvider.search(query);
      if (result.tracks.length) return result;
      return await youtubeProvider.search(query);
    } catch (error) {
      try { return await youtubeProvider.search(query); }
      catch {
        const detail = error instanceof Error ? error.message : "Audius is unavailable.";
        throw new Error(`Search failed. Audius: ${detail} YouTube Music may also be blocked by browser CORS.`);
      }
    }
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
  resetRadioQueue() { youtubeProvider.resetRadioQueue(); }
}
export const musicApi = new PlutoMusicApi();
