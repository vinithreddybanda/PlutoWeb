import type { SearchResult, Track } from "./types";
import { innertubePost } from "./core/innertube";
import {
  continueQueue,
  getRelatedTracks,
  getRadioQueue,
  type QueuePage
} from "./core/queue";

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
    const renderer = node.musicResponsiveListItemRenderer ??
      node.musicTwoRowItemRenderer ??
      node.playlistPanelVideoRenderer ??
      node.compactVideoRenderer;
    if (!renderer) return;

    const videoId = renderer.playlistItemData?.videoId ?? renderer.videoId;
    if (!videoId || found.has(videoId)) return;

    const flex = renderer.flexColumns ?? [];
    const title = text(flex[0]?.musicResponsiveListItemFlexColumnRenderer?.text) ||
      text(renderer.title) || "Unknown track";
    const artistColumn = flex[1]?.musicResponsiveListItemFlexColumnRenderer?.text;
    const artists = text(artistColumn) || text(renderer.shortBylineText) || "Unknown artist";
    const thumbnails = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
      renderer.thumbnail?.thumbnails ?? [];
    const thumbnail = thumbnails.at(-1)?.url;
    const duration = text(
      renderer.fixedColumns?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text
    ) || text(renderer.lengthText);

    found.set(videoId, {
      videoId,
      title,
      artists,
      thumbnail,
      duration: duration || undefined,
      playlistId: renderer.playlistId,
      musicVideoType: renderer.navigationEndpoint?.watchEndpoint
        ?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType,
      isLive: (renderer.badges ?? []).some((badge: AnyRecord) => Boolean(badge.liveBadgeRenderer))
    });
  });
  return [...found.values()];
}

export class YouTubeMusicWeb {
  private radioAudioOnly = false;
  private activeRadioPage: QueuePage | null = null;

  resetRadioQueue() {
    this.activeRadioPage = null;
  }

  setRadioAudioOnly(enabled: boolean) {
    this.radioAudioOnly = enabled;
  }

  async search(query: string): Promise<SearchResult> {
    const data = await innertubePost<AnyRecord>("search", {
      query,
      params: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D"
    });
    return { tracks: parseTracks(data) };
  }

  /** Uses the same automix-following radio queue flow as core/service YouTube.next. */
  async next(videoId: string, _playlistId?: string): Promise<Track[]> {
    if (this.activeRadioPage?.continuation) {
      const page = await continueQueue(this.activeRadioPage);
      this.activeRadioPage = page;
      return page.items;
    }

    const result = await getRelatedTracks(videoId, this.radioAudioOnly);
    this.activeRadioPage = result.page;
    return result.tracks;
  }

  async radio(videoId: string): Promise<QueuePage> {
    return getRadioQueue(videoId);
  }

  async continueRadio(page: QueuePage): Promise<QueuePage> {
    return continueQueue(page);
  }

  async stream(videoId: string): Promise<string> {
    const data = await innertubePost<AnyRecord>("player", {
      videoId,
      playbackContext: {
        contentPlaybackContext: {
          signatureTimestamp: 0
        }
      }
    });

    const formats = [
      ...(data.streamingData?.adaptiveFormats ?? []),
      ...(data.streamingData?.formats ?? [])
    ];
    const audio = formats
      .filter((format: AnyRecord) =>
        format.mimeType?.startsWith("audio/") && Boolean(format.url)
      )
      .sort((a: AnyRecord, b: AnyRecord) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];

    if (!audio?.url) {
      throw new Error(
        "No direct browser-playable audio URL was returned. This stream may require signature or PO-token handling that the browser port does not yet implement."
      );
    }
    return audio.url;
  }
}

export const musicApi = new YouTubeMusicWeb();
